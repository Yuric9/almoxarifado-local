import { getDb } from './db'
import { normalizarUnidade } from './constantes'
import tabela from './referencia/agetop.json'

/**
 * Classificação automática de materiais, sem internet.
 *
 * A categoria de cada material é sugerida, nesta ordem, por:
 *  1. texto de categoria que ficou grudado na unidade (ex.: "MATERIAL ELETRICO PAR");
 *  2. palavras-chave de grupos que a tabela oficial não cobre (EPI, ferramentas);
 *  3. materiais parecidos que você já classificou;
 *  4. a tabela de referência da GOINFRA (antiga AGETOP), com 1.810 materiais em 3 grupos.
 *
 * Nada é gravado aqui: o resultado é uma sugestão para o usuário conferir.
 */

export type Confianca = 'alta' | 'media' | 'baixa'

export type Referencia = { codigo: string; descricao: string; unidade: string; preco: number }

export type Sugestao = {
  categoria: string
  /** A categoria ainda não existe e será criada ao aplicar. */
  nova: boolean
  confianca: Confianca
  motivo: 'unidade' | 'palavra' | 'semelhante' | 'tabela'
  detalhe: string
  referencia?: Referencia
}

export const FONTE_REFERENCIA = tabela.fonte

/* ------------------------------------------------------------------ categorias padrão */

const CANONICAS: Array<{ nome: string; cor: string; apelidos: string[] }> = [
  { nome: 'Construção civil', cor: '#A16207', apelidos: ['construcao civil', 'material basico', 'materiais basicos', 'construcao', 'material de construcao', 'materiais de construcao'] },
  { nome: 'Elétrica', cor: '#2563EB', apelidos: ['eletrica', 'material eletrico', 'materiais eletricos', 'eletrico', 'eletricos'] },
  { nome: 'Hidráulica', cor: '#0EA5E9', apelidos: ['hidraulica', 'hidrossanitario', 'hidro sanitario', 'material hidro sanitario', 'material hidrossanitario', 'material hidraulico', 'materiais hidraulicos', 'hidraulico'] },
  { nome: 'EPI', cor: '#DC2626', apelidos: ['epi', 'epis', 'equipamento de protecao individual', 'equipamentos de protecao individual'] },
  { nome: 'Ferramentas', cor: '#F59E0B', apelidos: ['ferramentas', 'ferramenta'] },
  { nome: 'Limpeza', cor: '#16A34A', apelidos: ['limpeza', 'material de limpeza', 'materiais de limpeza', 'produtos de limpeza'] }
]

/** Grupo da tabela (na ordem de `tabela.grupos`) → categoria do sistema. */
const CATEGORIA_DO_GRUPO = ['Construção civil', 'Elétrica', 'Hidráulica']

const chave = (valor: string) => normalizar(valor).toLowerCase()

/** "MATERIAL ELETRICO" → "Elétrica"; nomes desconhecidos ficam como estão (só arruma maiúsculas). */
export function nomeCanonico(nome: string) {
  const k = chave(nome)
  const canonica = CANONICAS.find(c => chave(c.nome) === k || c.apelidos.includes(k))
  if (canonica) return canonica.nome
  const limpo = nome.replace(/\s+/g, ' ').trim()
  return limpo === limpo.toUpperCase() ? limpo.charAt(0) + limpo.slice(1).toLowerCase() : limpo
}

type CategoriaBanco = { id: number; nome: string }

/** Acha a categoria já cadastrada que corresponde ao nome (aceita apelidos: "MATERIAL ELETRICO" = "Elétrica"). */
export function categoriaExistente(nome: string, categorias: CategoriaBanco[]) {
  const canonico = nomeCanonico(nome)
  return categorias.find(c => chave(c.nome) === chave(canonico))
    ?? categorias.find(c => chave(c.nome) === chave(nome))
    ?? categorias.find(c => nomeCanonico(c.nome) === canonico)
    ?? null
}

/** Devolve o id da categoria, criando-a se ainda não existir. Use dentro de uma transação. */
export function obterOuCriarCategoria(nome: string) {
  const db = getDb()
  const categorias = db.prepare('SELECT id, nome FROM categorias').all() as CategoriaBanco[]
  const existente = categoriaExistente(nome, categorias)
  if (existente) return existente.id
  const canonico = nomeCanonico(nome)
  const cor = CANONICAS.find(c => c.nome === canonico)?.cor ?? '#64748B'
  return Number(db.prepare('INSERT INTO categorias (nome, cor) VALUES (?, ?)').run(canonico, cor).lastInsertRowid)
}

/* ------------------------------------------------------------------ texto */

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

const PARADAS = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'COM', 'SEM', 'PARA', 'P', 'E', 'EM', 'OU', 'TIPO', 'A', 'O', 'AS', 'OS', 'NA', 'NO', 'C', 'X', 'AO', 'POR',
  'REF', 'EQUIVALENTE', 'SIMILAR', 'MM', 'CM', 'M', 'UN', 'PC', 'D', 'N', 'NR', 'NO', 'DIAM', 'DIAMETRO', 'MARCA', 'MODELO', 'LINHA', 'COR', 'CORES'
])

function singular(p: string) {
  if (p.length <= 4) return p
  if (p.endsWith('OES')) return p.slice(0, -3) + 'AO'
  if (/(R|Z)ES$/.test(p)) return p.slice(0, -2)
  if (/[AEIO]S$/.test(p)) return p.slice(0, -1)
  return p
}

/** Nomes populares → como a tabela oficial escreve. */
const SINONIMOS: Record<string, string> = {
  CANO: 'TUBO', ABRACADEIRA: 'BRACADEIRA', REJUNTE: 'REJUNTAMENTO', DESCARGA: 'DESCARGA', VEDACITE: 'VEDACIT', LAMPADA: 'LAMPADA', FIO: 'CABO'
}

type Termos = { palavras: string[]; numeros: string[]; cabeca: string | null }

function termos(texto: string): Termos {
  const palavras: string[] = []
  const numeros: string[] = []
  for (const t of normalizar(texto).split(' ')) {
    if (!t || PARADAS.has(t)) continue
    if (/\d/.test(t)) numeros.push(t)
    else if (t.length >= 2) palavras.push(SINONIMOS[singular(t)] ?? singular(t))
  }
  return { palavras: Array.from(new Set(palavras)), numeros: Array.from(new Set(numeros)), cabeca: palavras[0] ?? null }
}

/** Distância de edição limitada: aceita erros de digitação como VAVULA → VALVULA. */
function quaseIgual(a: string, b: string) {
  if (a === b) return true
  const limite = Math.min(a.length, b.length) >= 8 ? 2 : Math.min(a.length, b.length) >= 5 ? 1 : 0
  if (!limite || Math.abs(a.length - b.length) > limite) return false
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    let menor = i
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      menor = Math.min(menor, atual[j])
    }
    if (menor > limite) return false
    anterior = atual
  }
  return anterior[b.length] <= limite
}

/* ------------------------------------------------------------------ índice de busca */

type Registro<T> = Termos & { dado: T }

class Indice<T> {
  private registros: Registro<T>[] = []
  private porPalavra = new Map<string, number[]>()
  private correcoes = new Map<string, string[]>()

  adicionar(texto: string, dado: T) {
    const r = { ...termos(texto), dado }
    const i = this.registros.push(r) - 1
    for (const p of r.palavras) {
      const lista = this.porPalavra.get(p)
      if (lista) lista.push(i)
      else this.porPalavra.set(p, [i])
    }
  }

  /** Palavras do índice iguais ou quase iguais (erro de digitação) à palavra procurada. */
  private equivalentes(palavra: string) {
    if (this.porPalavra.has(palavra)) return [palavra]
    let lista = this.correcoes.get(palavra)
    if (!lista) {
      lista = palavra.length < 5 ? [] : Array.from(this.porPalavra.keys()).filter(p => quaseIgual(palavra, p))
      this.correcoes.set(palavra, lista)
    }
    return lista
  }

  /** Registros parecidos, do mais para o menos parecido. */
  buscar(alvo: Termos, ignorar?: (dado: T) => boolean) {
    if (!alvo.palavras.length) return []
    const equivalentes = alvo.palavras.map(p => this.equivalentes(p))
    const candidatos = new Set<number>()
    equivalentes.forEach(lista => lista.forEach(p => this.porPalavra.get(p)!.forEach(i => candidatos.add(i))))
    const cabecas = new Set(equivalentes[0])
    const pesoAlvo = alvo.palavras.length + 0.3 * alvo.numeros.length

    const resultado: Array<{ registro: Registro<T>; nota: number; mesmaCabeca: boolean; comuns: number }> = []
    for (const i of Array.from(candidatos)) {
      const r = this.registros[i]
      if (ignorar?.(r.dado)) continue
      const comuns = equivalentes.filter(lista => lista.some(p => r.palavras.includes(p))).length
      const numerosComuns = alvo.numeros.filter(n => r.numeros.includes(n)).length
      const cobertura = (comuns + 0.3 * numerosComuns) / pesoAlvo
      const coberturaRegistro = comuns / Math.max(r.palavras.length, 1)
      const mesmaCabeca = !!r.cabeca && cabecas.has(r.cabeca)
      const nota = Math.min(1, 0.7 * cobertura + 0.3 * coberturaRegistro + (mesmaCabeca ? 0.2 : 0))
      resultado.push({ registro: r, nota, mesmaCabeca, comuns })
    }
    return resultado.sort((a, b) => b.nota - a.nota)
  }
}

/**
 * Escolhe a categoria entre os registros mais parecidos.
 * Um nome quase idêntico decide sozinho; senão, votam os registros próximos do melhor,
 * dando preferência aos que começam com a mesma palavra (ex.: todos os "REGISTRO ...").
 */
function votar<T>(encontrados: ReturnType<Indice<T>['buscar']>, categoriaDe: (dado: T) => string) {
  if (!encontrados.length) return null
  const topo = encontrados[0]
  if (topo.nota >= 0.85 && topo.comuns >= 2) {
    return { categoria: categoriaDe(topo.registro.dado), proporcao: 1, quantidade: 1, mesmaCabeca: topo.mesmaCabeca, melhor: topo }
  }
  const proximos = encontrados.filter(e => e.nota >= topo.nota - 0.15)
  const mesmos = proximos.filter(e => e.mesmaCabeca)
  const base = mesmos.length ? mesmos : proximos.slice(0, 5)
  const votos = new Map<string, number>()
  for (const e of base) votos.set(categoriaDe(e.registro.dado), (votos.get(categoriaDe(e.registro.dado)) ?? 0) + e.nota)
  const total = Array.from(votos.values()).reduce((a, b) => a + b, 0)
  const [categoria, peso] = Array.from(votos.entries()).sort((a, b) => b[1] - a[1])[0]
  const melhor = base.find(e => categoriaDe(e.registro.dado) === categoria)!
  return { categoria, proporcao: peso / total, quantidade: base.length, mesmaCabeca: mesmos.length > 0, melhor }
}

/* ------------------------------------------------------------------ tabela de referência */

type ItemTabela = Referencia & { grupo: number }
let indiceTabela: Indice<ItemTabela> | null = null

function tabelaReferencia() {
  if (!indiceTabela) {
    indiceTabela = new Indice<ItemTabela>()
    for (const [codigo, descricao, unidade, preco, grupo] of tabela.itens as Array<[string, string, string, number, number]>) {
      indiceTabela.adicionar(descricao, { codigo, descricao, unidade, preco, grupo })
    }
  }
  return indiceTabela
}

/* ------------------------------------------------------------------ palavras-chave */

const REGRAS: Array<{ categoria: string; padrao: RegExp }> = [
  {
    categoria: 'EPI',
    padrao: /^(BOTA|BOTINA|CAPACETE|PROTETOR (AURICULAR|SOLAR|FACIAL)|ABAFADOR|OCULOS|MASCARA|RESPIRADOR|TALABARTE|AVENTAL|PERNEIRA|MANGOTE|CAPA DE CHUVA|COLETE)\b|\bCINTO (DE )?SEGURANCA\b|^LUVA (DE |DA )?(RASPA|VAQUETA|LATEX|NITRIL|PROCEDIMENTO|SEGURANCA|MALHA|PIGMENTADA|BORRACHA|COURO|ALGODAO|ISOLANTE|TRICOTADA|MULTIUSO)/
  },
  {
    categoria: 'Limpeza',
    padrao: /^(DETERGENTE|DESINFETANTE|AGUA SANITARIA|SABAO|SABONETE|VASSOURA|RODO|PANO DE CHAO|PANO DE PRATO|FLANELA|ESPONJA|SACO (DE |PARA )?LIXO|PAPEL (HIGIENICO|TOALHA)|LIMPA |LUSTRA MOVEIS|CERA LIQUIDA|ALVEJANTE|AMACIANTE|SAPONACEO|PA DE LIXO|LIXEIRA|ESCOVA SANITARIA|MULTIUSO|ALCOOL (70|LIQUIDO|GEL))/
  },
  {
    categoria: 'Ferramentas',
    padrao: /^(MARTELO|MARRETA|ALICATE|TRENA|SERROTE|ARCO DE SERRA|COLHER DE PEDREIRO|DESEMPENADEIRA|ENXADA|PICARETA|CAVADEIRA|CARRINHO DE MAO|NIVEL DE BOLHA|PRUMO|ESQUADRO|TALHADEIRA|PONTEIRO|FORMAO|PE DE CABRA|ESPATULA|FURADEIRA|ESMERILHADEIRA|LIXADEIRA|PARAFUSADEIRA|FOICE|RASTELO|ANCINHO|ESTILETE|SERRA (MARMORE|CIRCULAR|TICO)|CHAVE (DE FENDA|PHILIPS|PHILLIPS|INGLESA|GRIFO|DE BOCA|COMBINADA|ALLEN|ESTRELA|DE TESTE|TESTE))\b/
  }
]

/* ------------------------------------------------------------------ unidade com categoria grudada */

const UNIDADES_CONHECIDAS = new Set([
  'UN', 'UND', 'UNID', 'UNIDADE', 'PAR', 'PC', 'PCA', 'PECA', 'PT', 'PCT', 'PACOTE', 'KG', 'G', 'L', 'LT', 'LTS', 'LITRO', 'ML', 'M', 'MT', 'METRO',
  'M2', 'M3', 'CX', 'CAIXA', 'SC', 'SACO', 'RL', 'ROLO', 'GL', 'GALAO', 'BL', 'BALDE', 'BR', 'BARRA', 'MIL', 'CJ', 'FD', 'TB', 'JG', 'KIT', 'FR', 'LATA', 'TUBO'
])

/** "MATERIAL ELETRICO PAR" → unidade "PAR" e categoria "MATERIAL ELETRICO". */
export function separarUnidade(valor: string): { unidade: string; categoria: string | null } {
  const texto = valor.replace(/\s+/g, ' ').trim()
  const m = texto.match(/^(.*[A-Za-zÀ-ÿ].*?)\s+(\S+)$/)
  if (!m || !UNIDADES_CONHECIDAS.has(normalizar(m[2]).replace(/ /g, ''))) return { unidade: texto, categoria: null }
  const prefixo = m[1].trim()
  if (normalizar(prefixo).replace(/ /g, '').length < 3) return { unidade: texto, categoria: null }
  return { unidade: normalizarUnidade(m[2]) ?? m[2].toUpperCase(), categoria: prefixo }
}

/* ------------------------------------------------------------------ classificação */

type ProdutoBanco = { id: number; nome: string; unidade: string; categoria_id: number | null; categoria: string | null }

function contexto() {
  const db = getDb()
  const categorias = db.prepare('SELECT id, nome FROM categorias').all() as CategoriaBanco[]
  const produtos = db.prepare(`
    SELECT p.id, p.nome, p.unidade, p.categoria_id, c.nome AS categoria
    FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id
    ORDER BY p.nome COLLATE NOCASE
  `).all() as ProdutoBanco[]
  const aprendidos = new Indice<ProdutoBanco>()
  for (const p of produtos) if (p.categoria) aprendidos.adicionar(p.nome, p)
  return { categorias, produtos, aprendidos }
}

type Contexto = ReturnType<typeof contexto>

function sugerir(categoria: string, ctx: Contexto, resto: Omit<Sugestao, 'categoria' | 'nova'>): Sugestao {
  const existente = categoriaExistente(categoria, ctx.categorias)
  return { categoria: existente?.nome ?? nomeCanonico(categoria), nova: !existente, ...resto }
}

function classificarComContexto(nome: string, ctx: Contexto, ignorarId?: number): Sugestao | null {
  const alvo = termos(nome)
  if (!alvo.palavras.length) return null
  const texto = normalizar(nome)

  for (const regra of REGRAS) {
    if (regra.padrao.test(texto)) return sugerir(regra.categoria, ctx, { confianca: 'alta', motivo: 'palavra', detalhe: `Palavra-chave de ${regra.categoria}` })
  }

  const meus = votar(ctx.aprendidos.buscar(alvo, p => p.id === ignorarId), p => p.categoria!)
  if (meus && meus.mesmaCabeca && meus.proporcao >= 0.7) {
    const exemplo = meus.melhor.registro.dado.nome
    return sugerir(meus.categoria, ctx, {
      confianca: meus.quantidade >= 2 && meus.proporcao >= 0.9 && meus.melhor.comuns >= Math.min(2, alvo.palavras.length) ? 'alta' : 'media',
      motivo: 'semelhante',
      detalhe: meus.quantidade > 1 ? `Igual a ${meus.quantidade} materiais seus, como "${exemplo}"` : `Parecido com "${exemplo}"`
    })
  }

  const oficial = votar(tabelaReferencia().buscar(alvo).slice(0, 40), i => CATEGORIA_DO_GRUPO[i.grupo])
  if (oficial && oficial.melhor.nota >= 0.3) {
    const ref = oficial.melhor.registro.dado
    // Só a primeira palavra igual ("ROLO de espuma" x "ROLO de papel") não basta: precisa de mais palavras em comum.
    const bastante = oficial.melhor.comuns >= Math.min(2, alvo.palavras.length)
    const confianca: Confianca = oficial.mesmaCabeca && bastante && oficial.proporcao >= 0.8 && oficial.melhor.nota >= 0.5
      ? 'alta'
      : (oficial.mesmaCabeca && bastante && oficial.proporcao >= 0.6) || oficial.melhor.nota >= 0.75 ? 'media' : 'baixa'
    return sugerir(oficial.categoria, ctx, {
      confianca,
      motivo: 'tabela',
      detalhe: `Tabela AGETOP ${ref.codigo}: ${ref.descricao}`,
      referencia: { codigo: ref.codigo, descricao: ref.descricao, unidade: ref.unidade, preco: ref.preco }
    })
  }
  return null
}

/** Sugestão de categoria para um nome de material (cadastro e importação). */
export function classificarNome(nome: string, ignorarId?: number) {
  return classificarComContexto(nome, contexto(), ignorarId)
}

export type ItemClassificacao = {
  produto_id: number
  nome: string
  unidade_atual: string
  /** Preenchida quando a unidade tinha a categoria grudada e será corrigida. */
  unidade_nova: string | null
  categoria_atual: string | null
  sugestao: Sugestao | null
}

/**
 * Lista os materiais sem categoria (ou todos, se `todos`) com a categoria sugerida.
 * Materiais cuja sugestão é a própria categoria atual não aparecem.
 */
export function classificarMateriais(todos = false): ItemClassificacao[] {
  const ctx = contexto()
  const lista: ItemClassificacao[] = []
  for (const p of ctx.produtos) {
    const separada = separarUnidade(p.unidade)
    const unidadeNova = separada.categoria && separada.unidade !== p.unidade ? separada.unidade : null
    if (p.categoria && !todos && !unidadeNova) continue

    let sugestao: Sugestao | null
    if (p.categoria && !todos) {
      sugestao = null
    } else if (separada.categoria && !p.categoria) {
      sugestao = sugerir(separada.categoria, ctx, { confianca: 'alta', motivo: 'unidade', detalhe: `Estava escrito na unidade: "${p.unidade}"` })
    } else {
      sugestao = classificarComContexto(p.nome, ctx, p.id)
    }
    if (p.categoria && sugestao && chave(sugestao.categoria) === chave(p.categoria)) sugestao = null
    if (p.categoria && !sugestao && !unidadeNova) continue
    lista.push({ produto_id: p.id, nome: p.nome, unidade_atual: p.unidade, unidade_nova: unidadeNova, categoria_atual: p.categoria, sugestao })
  }
  return lista
}

/** Grava a categoria (e a unidade corrigida) dos materiais escolhidos. Tudo ou nada. */
export function aplicarClassificacao(input: { itens: unknown }) {
  if (!Array.isArray(input.itens) || !input.itens.length) throw new Error('Nenhum material selecionado')
  const itens = input.itens as Array<{ produto_id: unknown; categoria?: unknown; unidade?: unknown }>
  const db = getDb()
  return db.transaction(() => {
    const antes = (db.prepare('SELECT COUNT(*) AS total FROM categorias').get() as { total: number }).total
    let atualizados = 0
    for (const item of itens) {
      const id = Number(item.produto_id)
      const atual = db.prepare('SELECT id, nome, categoria_id, unidade FROM produtos WHERE id=?').get(id) as ProdutoBanco | undefined
      if (!atual) throw new Error('Material não encontrado')
      const nomeCategoria = typeof item.categoria === 'string' ? item.categoria.trim() : ''
      const categoriaId = nomeCategoria ? obterOuCriarCategoria(nomeCategoria) : atual.categoria_id
      const unidade = typeof item.unidade === 'string' && item.unidade.trim() ? item.unidade.trim().toUpperCase() : atual.unidade
      db.prepare('UPDATE produtos SET categoria_id=?, unidade=? WHERE id=?').run(categoriaId, unidade, id)
      atualizados++
    }
    const criadas = (db.prepare('SELECT COUNT(*) AS total FROM categorias').get() as { total: number }).total - antes
    return { atualizados, categorias_criadas: criadas }
  })()
}
