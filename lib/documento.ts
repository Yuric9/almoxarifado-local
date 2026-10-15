import { unzipSync, strFromU8 } from 'fflate'
import { getDb } from './db'
import { lerArquivoPlanilha, numeroCelula } from './planilha'

/**
 * Leitura de documentos (PDF, XML da NF-e, Word e Excel) para importar materiais.
 *
 * O resultado é sempre uma lista de itens para o usuário conferir na tela
 * antes de qualquer gravação. Nada aqui altera o banco.
 */

export type ItemLido = {
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  valor_unitario: number | null
}

export type Sugestao = { produto_id: number; nome: string; unidade: string; motivo: 'codigo' | 'nome' | 'semelhante' } | null

export type DocumentoLido = {
  tipo: 'nfe' | 'tabela'
  formato: 'pdf' | 'xml' | 'docx' | 'xlsx' | 'csv'
  numero: string | null
  fornecedor: string | null
  data: string | null
  itens: Array<ItemLido & { sugestao: Sugestao }>
  avisos: string[]
}

/* ------------------------------------------------------------------ utilidades */

/** Junta a continuação de uma descrição quebrada em linhas (sem espaço quando a quebra foi no hífen). */
const continuar = (inicio: string, resto: string) => (inicio.endsWith('-') ? inicio + resto : `${inicio} ${resto}`).replace(/\s+/g, ' ').trim()

const normalizar = (valor: unknown) =>
  String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const UNIDADES_EQUIVALENTES: Record<string, string> = {
  UND: 'UN', UNID: 'UN', UNIDADE: 'UN', UNIDADES: 'UN', U: 'UN', UNI: 'UN',
  M3: 'M³', M2: 'M²', MT: 'M', MTS: 'M', METRO: 'M', METROS: 'M',
  SACO: 'SC', SACOS: 'SC', CAIXA: 'CX', CXS: 'CX', PACOTE: 'PCT', PC: 'PC', PÇ: 'PC', PECA: 'PC', PEÇA: 'PC',
  LITRO: 'L', LITROS: 'L', LT: 'L', KILO: 'KG', QUILO: 'KG', KGS: 'KG', ROLO: 'RL', GALAO: 'GL', GALÃO: 'GL', PARES: 'PAR', BARRA: 'BR', BARRAS: 'BR'
}

export function normalizarUnidade(valor: string | null | undefined) {
  const u = String(valor ?? '').trim().toUpperCase().replace(/\.$/, '')
  if (!u) return null
  return UNIDADES_EQUIVALENTES[u] ?? u
}

function numero(valor: unknown): number | null {
  try {
    return numeroCelula(valor === undefined ? null : (valor as string | number | null))
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ colunas de tabela */

type Papel = 'codigo' | 'descricao' | 'unidade' | 'quantidade' | 'valor_unitario' | 'outro'

const CABECALHOS: Array<[Papel, string[]]> = [
  ['codigo', ['codigo', 'cod', 'codigo_produto', 'codigo_do_produto', 'ref', 'referencia', 'sku', 'cod_produto']],
  ['descricao', ['descricao', 'descricao_do_produto', 'descricao_do_material', 'descricao_do_produto_servico', 'material', 'materiais', 'produto', 'produtos', 'especificacao', 'nome']],
  ['unidade', ['un', 'und', 'unid', 'unidade', 'u_m', 'um', 'medida']],
  ['quantidade', ['quantidade', 'quant', 'qtd', 'qtde', 'qnt', 'quantidade_solicitada', 'qtd_solicitada']],
  ['valor_unitario', ['valor_unit', 'valor_unitario', 'vl_unit', 'vlr_unit', 'preco', 'preco_unit', 'preco_unitario']],
  // Colunas conhecidas que não importamos, mas que delimitam as outras.
  ['outro', ['ncm', 'ncm_sh', 'cst', 'o_cst', 'cfop', 'valor', 'valor_total', 'total', 'vl_total', 'desconto', 'valor_desc', 'icms', 'ipi', 'aliq', 'b_calc', 'item', 'n', 'no', 'seq', 'obs', 'observacao']]
]

function papelDoCabecalho(texto: unknown): Papel | null {
  const n = normalizar(texto)
  if (!n) return null
  for (const [papel, nomes] of CABECALHOS) if (nomes.includes(n)) return papel
  // Cabeçalhos compostos: "descricao_do_produto_servico", "quantidade_entregue"...
  for (const [papel, nomes] of CABECALHOS) if (papel !== 'outro' && nomes.some(nome => nome.length > 3 && n.startsWith(nome))) return papel
  return null
}

/** Localiza a linha de cabeçalho e lê os itens de uma tabela já separada em células. */
export function itensDeTabela(linhas: unknown[][]): ItemLido[] {
  let melhor: { indice: number; colunas: Map<Papel, number> } | null = null
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const colunas = new Map<Papel, number>()
    linhas[i].forEach((celula, c) => {
      const papel = papelDoCabecalho(celula)
      if (papel && papel !== 'outro' && !colunas.has(papel)) colunas.set(papel, c)
    })
    if (colunas.has('descricao') && (colunas.has('quantidade') || colunas.size >= 3) && (!melhor || colunas.size > melhor.colunas.size)) {
      melhor = { indice: i, colunas }
    }
  }
  if (!melhor) return []

  const { indice, colunas } = melhor
  const celula = (linha: unknown[], papel: Papel) => (colunas.has(papel) ? linha[colunas.get(papel)!] : undefined)
  const itens: ItemLido[] = []
  for (const linha of linhas.slice(indice + 1)) {
    const descricao = String(celula(linha, 'descricao') ?? '').replace(/\s+/g, ' ').trim()
    if (!descricao) continue
    if (/^(total|subtotal|soma)\b/i.test(descricao)) continue
    itens.push({
      codigo: String(celula(linha, 'codigo') ?? '').trim() || null,
      descricao,
      unidade: normalizarUnidade(String(celula(linha, 'unidade') ?? '')),
      quantidade: numero(celula(linha, 'quantidade')),
      valor_unitario: numero(celula(linha, 'valor_unitario'))
    })
  }
  return itens
}

/* ------------------------------------------------------------------ PDF */

type Pedaco = { texto: string; x: number; fim: number }
type LinhaPdf = { y: number; pagina: number; pedacos: Pedaco[]; texto: string }

/** Reconstrói as linhas do PDF a partir das posições do texto, separando palavras com posição aproximada. */
async function linhasDoPdf(conteudo: Buffer): Promise<LinhaPdf[]> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(conteudo))
  const resultado: LinhaPdf[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p)
    const conteudoPagina = await pagina.getTextContent()
    const grupos: Array<{ y: number; pedacos: Pedaco[] }> = []
    for (const item of conteudoPagina.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const x = item.transform[4]
      const y = item.transform[5]
      const largura = item.width || item.str.length * 4
      let grupo = grupos.find(g => Math.abs(g.y - y) <= 2.5)
      if (!grupo) grupos.push((grupo = { y, pedacos: [] }))
      // O PDF às vezes junta várias colunas num único texto ("MIL 2,0000"): separa por palavra
      // e estima a posição de cada uma proporcionalmente.
      let deslocamento = 0
      for (const parte of item.str.split(/(\s+)/)) {
        if (parte.trim()) {
          const inicio = x + (largura * deslocamento) / item.str.length
          grupo.pedacos.push({ texto: parte, x: inicio, fim: inicio + (largura * parte.length) / item.str.length })
        }
        deslocamento += parte.length
      }
    }
    grupos.sort((a, b) => b.y - a.y)
    for (const g of grupos) {
      g.pedacos.sort((a, b) => a.x - b.x)
      resultado.push({ y: g.y, pagina: p, pedacos: g.pedacos, texto: g.pedacos.map(c => c.texto).join(' ') })
    }
  }
  await pdf.cleanup()
  return resultado
}

const NUM = String.raw`\d[\d.]*,\d+|\d+`
// Linha de produto do DANFE: código, descrição, NCM, CST, CFOP, unidade, quantidade, valor unitário, valor total.
const LINHA_DANFE = new RegExp(String.raw`^(\S+)\s+(.*?)\s*(\d{8}|00)\s+(\d{2,4})\s+([1-7]\d{3})\s+(\S{1,6})\s+(${NUM})\s+(${NUM})\s+(${NUM})`)

function lerDanfe(linhas: LinhaPdf[]): Omit<DocumentoLido, 'formato' | 'itens' | 'avisos'> & { itens: ItemLido[] } {
  const textos = linhas.map(l => l.texto)
  /** Valor impresso logo abaixo de um rótulo, na mesma coluna (o DANFE é um formulário em caixas). */
  const abaixoDe = (rotulo: RegExp) => {
    const i = linhas.findIndex(l => rotulo.test(l.texto))
    if (i < 0) return undefined
    const noInicio = new RegExp('^' + rotulo.source, rotulo.flags)
    const pedacos = linhas[i].pedacos
    const k = pedacos.findIndex((_, j) => noInicio.test(pedacos.slice(j).map(p => p.texto).join(' ')))
    const inicioRotulo = pedacos[Math.max(k, 0)].x
    for (const l of linhas.slice(i + 1, i + 5)) {
      const k = l.pedacos.findIndex(p => Math.abs(p.x - inicioRotulo) < 15)
      if (k < 0) continue
      const palavras = [l.pedacos[k]]
      for (const p of l.pedacos.slice(k + 1)) {
        if (p.x - palavras[palavras.length - 1].fim > 15) break
        palavras.push(p)
      }
      return palavras.map(p => p.texto).join(' ')
    }
    return undefined
  }
  const numeroNf = textos.join(' ').match(/N[º°o.]\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d{3,9})/)?.[1]?.replace(/\./g, '').replace(/^0+/, '') || null
  const fornecedor =
    textos.join(' ').match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i)?.[1] ||
    abaixoDe(/IDENTIFICA[ÇC][ÃA]O DO EMITENTE/i)?.trim() || null
  const data = (abaixoDe(/DATA D[AE] EMISS[ÃA]O/i) || '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null

  const itens: ItemLido[] = []
  let dentro = false
  let ultimo: ItemLido | null = null
  for (const l of linhas) {
    if (/DADOS DOS? PRODUTOS?/i.test(l.texto)) { dentro = true; ultimo = null; continue }
    if (/DADOS ADICIONAIS|C[ÁA]LCULO DO ISSQN|RESERVADO AO FISCO|INFORMA[ÇC][ÕO]ES COMPLEMENTARES/i.test(l.texto)) { dentro = false; ultimo = null; continue }
    if (!dentro) continue
    const m = l.texto.match(LINHA_DANFE)
    if (m) {
      ultimo = {
        codigo: m[1],
        descricao: m[2].trim(),
        unidade: normalizarUnidade(m[6]),
        quantidade: numero(m[7]),
        valor_unitario: numero(m[8])
      }
      itens.push(ultimo)
    } else if (ultimo && !/C[ÓO]DIGO|DESCRI[ÇC][ÃA]O|NCM|QUANT|VALOR/i.test(l.texto)) {
      // Continuação da descrição na linha de baixo.
      ultimo.descricao = continuar(ultimo.descricao, l.texto)
    }
  }
  return { tipo: 'nfe', numero: numeroNf, fornecedor: fornecedor?.replace(/\s+/g, ' ') || null, data, itens }
}

/** Tabela genérica em PDF: usa as posições do cabeçalho para distribuir cada palavra na coluna mais próxima. */
function lerTabelaPdf(linhas: LinhaPdf[]): ItemLido[] {
  type Coluna = { papel: Papel; centro: number }
  let indice = -1
  let colunas: Coluna[] = []
  let melhor = 0
  linhas.forEach((l, i) => {
    const encontradas = l.pedacos
      .map(p => ({ papel: papelDoCabecalho(p.texto), centro: (p.x + p.fim) / 2 }))
      .filter((c): c is Coluna => c.papel !== null)
    const papeis = new Set(encontradas.map(c => c.papel).filter(p => p !== 'outro'))
    if (papeis.has('descricao') && (papeis.has('quantidade') || papeis.size >= 3) && papeis.size > melhor) {
      indice = i
      colunas = encontradas
      melhor = papeis.size
    }
  })
  if (indice < 0) return []

  const itens: ItemLido[] = []
  let ultimo: ItemLido | null = null
  for (const l of linhas.slice(indice + 1)) {
    // Cabeçalho repetido nas páginas seguintes.
    if (l.pedacos.filter(p => papelDoCabecalho(p.texto)).length >= 2) continue
    const valores = new Map<Papel, string[]>()
    for (const p of l.pedacos) {
      const centro = (p.x + p.fim) / 2
      const coluna = colunas.reduce((a, b) => (Math.abs(b.centro - centro) < Math.abs(a.centro - centro) ? b : a))
      valores.set(coluna.papel, [...(valores.get(coluna.papel) || []), p.texto])
    }
    const texto = (papel: Papel) => (valores.get(papel) || []).join(' ').trim()
    const descricao = texto('descricao')
    const quantidade = numero(texto('quantidade'))
    if (/^(total|subtotal|valor total)\b/i.test(l.texto)) break
    if (descricao && quantidade !== null) {
      ultimo = { codigo: texto('codigo') || null, descricao, unidade: normalizarUnidade(texto('unidade')), quantidade, valor_unitario: numero(texto('valor_unitario')) }
      itens.push(ultimo)
    } else if (ultimo && descricao && valores.size === 1) {
      // Continuação da descrição na linha de baixo.
      ultimo.descricao = continuar(ultimo.descricao, descricao)
    }
  }
  return itens
}

/* ------------------------------------------------------------------ Word */

function decodificarXml(texto: string) {
  return texto
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** Extrai as tabelas de um .docx (cada tabela vira uma lista de linhas com células de texto). */
export function tabelasDoDocx(conteudo: Buffer): string[][][] {
  let arquivos: Record<string, Uint8Array>
  try {
    arquivos = unzipSync(new Uint8Array(conteudo), { filter: f => f.name === 'word/document.xml' })
  } catch {
    throw new Error('Arquivo Word inválido ou corrompido')
  }
  const xml = arquivos['word/document.xml'] ? strFromU8(arquivos['word/document.xml']) : ''
  if (!xml) throw new Error('Arquivo Word inválido ou corrompido')
  const textoDe = (trecho: string) =>
    decodificarXml((trecho.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
      .map(t => (t.startsWith('<w:t') && !t.startsWith('<w:tab') ? t.replace(/<[^>]+>/g, '') : ' '))
      .join('')).replace(/\s+/g, ' ').trim()
  return (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).map(tabela =>
    (tabela.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || []).map(linha =>
      (linha.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || []).map(textoDe)
    )
  )
}

/* ------------------------------------------------------------------ correspondência com materiais */

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'em', 'e', 'x'])
const palavras = (texto: string) => new Set(normalizar(texto).split('_').filter(p => p.length > 1 && !PALAVRAS_VAZIAS.has(p)))

export function sugerirMaterial(item: Pick<ItemLido, 'codigo' | 'descricao'>): Sugestao {
  const produtos = getDb().prepare('SELECT id, nome, codigo, unidade FROM produtos WHERE ativo=1').all() as Array<{ id: number; nome: string; codigo: string | null; unidade: string }>
  if (item.codigo) {
    const porCodigo = produtos.find(p => p.codigo && p.codigo.toLowerCase() === item.codigo!.toLowerCase())
    if (porCodigo) return { produto_id: porCodigo.id, nome: porCodigo.nome, unidade: porCodigo.unidade, motivo: 'codigo' }
  }
  const alvo = normalizar(item.descricao)
  const porNome = produtos.find(p => normalizar(p.nome) === alvo)
  if (porNome) return { produto_id: porNome.id, nome: porNome.nome, unidade: porNome.unidade, motivo: 'nome' }

  const doItem = palavras(item.descricao)
  let melhor: { produto: (typeof produtos)[number]; nota: number } | null = null
  for (const produto of produtos) {
    const doProduto = palavras(produto.nome)
    if (!doProduto.size || !doItem.size) continue
    const comuns = Array.from(doProduto).filter(p => doItem.has(p)).length
    // Proporção das palavras do material cadastrado que aparecem na descrição do documento.
    const nota = comuns / doProduto.size
    if (nota >= 0.6 && comuns >= 2 && (!melhor || nota > melhor.nota)) melhor = { produto, nota }
  }
  return melhor ? { produto_id: melhor.produto.id, nome: melhor.produto.nome, unidade: melhor.produto.unidade, motivo: 'semelhante' } : null
}

const LIMITE_ITENS = 500

/* ------------------------------------------------------------------ XML da NF-e */

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function textoXml(valor: string) {
  return valor
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (inteiro, ent: string) => {
      if (ent[0] === '#') return String.fromCodePoint(ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10))
      return ENTIDADES[ent.toLowerCase()] ?? inteiro
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** Conteúdo da primeira tag com esse nome (aceita prefixo de namespace, ex.: <nfe:xProd>). */
function tag(xml: string, nome: string) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`))
  return m ? textoXml(m[1]) : null
}

function blocos(xml: string, nome: string) {
  return Array.from(xml.matchAll(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'g')), m => m[1])
}

/** No XML os números usam ponto decimal (ex.: 6.5000), diferente do PDF. */
function numeroXml(valor: string | null) {
  if (!valor) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

export function lerXmlNfe(conteudo: Buffer): Omit<DocumentoLido, 'avisos' | 'itens'> & { itens: ItemLido[] } {
  const xml = conteudo.toString('utf8').replace(/^\uFEFF/, '')
  if (!/<(?:\w+:)?infNFe[\s>]/.test(xml)) {
    if (/<(?:\w+:)?resNFe[\s>]/.test(xml)) throw new Error('Este XML é apenas o resumo da nota (sem os itens). Baixe o XML completo da NF-e.')
    throw new Error('Este XML não é de uma nota fiscal eletrônica (NF-e).')
  }
  const ide = blocos(xml, 'ide')[0] ?? ''
  const emit = blocos(xml, 'emit')[0] ?? ''
  const emissao = tag(ide, 'dhEmi') || tag(ide, 'dEmi')
  const data = emissao?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const itens = blocos(xml, 'det').map(det => {
    const prod = blocos(det, 'prod')[0] ?? det
    return {
      codigo: tag(prod, 'cProd'),
      descricao: tag(prod, 'xProd') || '',
      unidade: normalizarUnidade(tag(prod, 'uCom')),
      quantidade: numeroXml(tag(prod, 'qCom')),
      valor_unitario: numeroXml(tag(prod, 'vUnCom'))
    }
  }).filter(i => i.descricao)
  return {
    tipo: 'nfe',
    formato: 'xml',
    numero: tag(ide, 'nNF'),
    fornecedor: tag(emit, 'xNome'),
    data: data ? `${data[3]}/${data[2]}/${data[1]}` : null,
    itens
  }
}

/* ------------------------------------------------------------------ entrada principal */

export async function lerDocumento(conteudo: Buffer, nomeArquivo: string): Promise<DocumentoLido> {
  const nome = nomeArquivo.toLowerCase()
  const avisos: string[] = []
  let base: Omit<DocumentoLido, 'itens' | 'avisos'> & { itens: ItemLido[] }

  if (nome.endsWith('.pdf')) {
    let linhas: LinhaPdf[]
    try {
      linhas = await linhasDoPdf(conteudo)
    } catch {
      throw new Error('Não foi possível abrir o PDF. Verifique se o arquivo não está corrompido ou protegido por senha.')
    }
    if (!linhas.length) {
      throw new Error('Este PDF não tem texto selecionável (parece ser uma imagem escaneada). Use o PDF original gerado pelo sistema do fornecedor, ou uma planilha.')
    }
    const ehDanfe = linhas.some(l => /DANFE|DOCUMENTO AUXILIAR DA NOTA FISCAL/i.test(l.texto))
    base = ehDanfe ? { ...lerDanfe(linhas), formato: 'pdf' } : { tipo: 'tabela', formato: 'pdf', numero: null, fornecedor: null, data: null, itens: lerTabelaPdf(linhas) }
    if (ehDanfe && !base.itens.length) {
      base = { ...base, tipo: 'tabela', itens: lerTabelaPdf(linhas) }
      if (base.itens.length) avisos.push('A nota não seguiu o layout padrão do DANFE; os itens foram lidos pela tabela. Confira com atenção.')
    }
  } else if (nome.endsWith('.xml')) {
    base = lerXmlNfe(conteudo)
  } else if (nome.endsWith('.docx')) {
    const tabelas = tabelasDoDocx(conteudo)
    const itens = tabelas.map(itensDeTabela).sort((a, b) => b.length - a.length)[0] || []
    base = { tipo: 'tabela', formato: 'docx', numero: null, fornecedor: null, data: null, itens }
    if (!tabelas.length) avisos.push('O documento Word não tem tabelas. Coloque os materiais em uma tabela com colunas como Descrição, Quantidade e Unidade.')
  } else if (nome.endsWith('.xlsx') || nome.endsWith('.csv')) {
    const linhas = await lerArquivoPlanilha(conteudo, nomeArquivo)
    base = { tipo: 'tabela', formato: nome.endsWith('.csv') ? 'csv' : 'xlsx', numero: null, fornecedor: null, data: null, itens: itensDeTabela(linhas) }
  } else if (nome.endsWith('.doc') || nome.endsWith('.xls')) {
    throw new Error('Formato antigo do Office não é suportado. Abra o arquivo no Word/Excel e use "Salvar como" .docx ou .xlsx.')
  } else {
    throw new Error('Envie um arquivo PDF, XML da NF-e, Word (.docx) ou Excel (.xlsx/.csv)')
  }

  if (!base.itens.length) {
    throw new Error('Não encontrei uma lista de materiais no documento. Ele precisa ter uma tabela com colunas como Descrição, Quantidade e Unidade (ou ser uma nota fiscal DANFE).')
  }
  if (base.itens.length > LIMITE_ITENS) {
    avisos.push(`O documento tem ${base.itens.length} itens; foram carregados os primeiros ${LIMITE_ITENS}.`)
    base.itens = base.itens.slice(0, LIMITE_ITENS)
  }
  const semQuantidade = base.itens.filter(i => i.quantidade === null).length
  if (semQuantidade) avisos.push(`${semQuantidade} item(ns) sem quantidade reconhecida. Preencha na conferência.`)

  return { ...base, avisos, itens: base.itens.map(i => ({ ...i, sugestao: sugerirMaterial(i) })) }
}
