import { readSheet } from 'read-excel-file/node'
import writeXlsxFile from 'write-excel-file/node'
import { getDb } from './db'
import { ajustarEstoque, atualizarProduto, criarCategoria, criarProduto, listarCategorias, listarProdutos } from './repository'

type Celula = string | number | boolean | Date | null

/* ------------------------------------------------------------------ exportação */

const COLUNAS = ['Código', 'Nome', 'Categoria', 'Unidade', 'Estoque mínimo', 'Localização', 'Quantidade', 'Reservado', 'Disponível', 'Ativo'] as const

function linhasMateriais(): Celula[][] {
  return listarProdutos().map(p => [
    p.codigo, p.nome, p.categoria, p.unidade, p.estoque_minimo, p.localizacao,
    p.quantidade_atual, p.quantidade_reservada, p.quantidade_disponivel, p.ativo ? 'Sim' : 'Não'
  ])
}

export async function exportarMateriaisXlsx() {
  const cabecalho = COLUNAS.map(value => ({ value, fontWeight: 'bold' as const }))
  const linhas = linhasMateriais().map(l => l.map(v => (v === null ? null : { value: v })))
  return writeXlsxFile([cabecalho, ...linhas], {
    sheet: 'Materiais',
    columns: [12, 36, 18, 10, 14, 18, 12, 12, 12, 8].map(width => ({ width })),
    stickyRowsCount: 1
  }).toBuffer()
}

/** CSV no padrão do Excel em português: separador ";", vírgula decimal e BOM UTF-8. */
export function exportarMateriaisCsv() {
  return gerarCsv([COLUNAS as unknown as Celula[], ...linhasMateriais()])
}

export function gerarCsv(linhas: Celula[][]) {
  const celula = (v: Celula) => {
    if (v === null || v === undefined) return ''
    const texto = typeof v === 'number' ? String(v).replace('.', ',') : v instanceof Date ? v.toISOString() : String(v)
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  return '﻿' + linhas.map(l => l.map(celula).join(';')).join('\r\n') + '\r\n'
}

export async function modeloImportacaoXlsx() {
  const cabecalho = ['Código', 'Nome', 'Categoria', 'Unidade', 'Estoque mínimo', 'Localização', 'Quantidade']
    .map(value => ({ value, fontWeight: 'bold' as const }))
  const exemplo = ['MAT-001', 'Tijolo furado 8 furos', 'Geral', 'UN', 500, 'Pátio A', 2000].map(value => ({ value }))
  return writeXlsxFile([cabecalho, exemplo], {
    sheet: 'Materiais',
    columns: [12, 36, 18, 10, 14, 18, 12].map(width => ({ width }))
  }).toBuffer()
}

/* ------------------------------------------------------------------ importação */

const ALIASES: Record<string, string[]> = {
  nome: ['nome', 'material', 'descricao', 'produto', 'item'],
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref'],
  categoria: ['categoria', 'grupo'],
  unidade: ['unidade', 'un', 'und', 'unid'],
  minimo: ['estoque_minimo', 'minimo', 'min', 'estoque_min', 'alerta'],
  localizacao: ['localizacao', 'local', 'prateleira', 'endereco', 'posicao'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'estoque', 'saldo', 'quantidade_atual', 'fisico']
}

function normalizar(valor: unknown) {
  return String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function textoCelula(v: Celula) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** Aceita "1.234,5" e "1.000" (pt-BR), "1234.5" e números já convertidos pela planilha. */
export function numeroCelula(v: Celula): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  let t = String(v).trim().replace(/\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '') // "1.000" = mil
  const n = Number(t)
  if (!Number.isFinite(n)) throw new Error(`"${v}" não é um número válido`)
  return n
}

export function lerCsv(conteudo: string): string[][] {
  const texto = conteudo.replace(/^﻿/, '')
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] || ''
  const separador = (primeiraLinha.match(/;/g) || []).length >= (primeiraLinha.match(/,/g) || []).length ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === separador) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); linhas.push(linha); linha = []; campo = ''
    } else campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas.filter(l => l.some(c => c.trim() !== ''))
}

export type ResultadoImportacao = {
  criados: number
  atualizados: number
  ajustados: number
  erros: Array<{ linha: number; mensagem: string }>
}

export async function lerArquivoPlanilha(conteudo: Buffer, nomeArquivo: string): Promise<Celula[][]> {
  const nome = nomeArquivo.toLowerCase()
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) return lerCsv(conteudo.toString('utf8'))
  if (nome.endsWith('.xlsx')) return (await readSheet(conteudo)) as Celula[][]
  if (nome.endsWith('.xls')) throw new Error('Formato .xls antigo não é suportado. No Excel, use "Salvar como" → Pasta de Trabalho do Excel (.xlsx) ou CSV.')
  throw new Error('Envie um arquivo .xlsx ou .csv')
}

/**
 * Importa materiais. Linhas são identificadas pelo código (se houver) ou pelo nome.
 * Materiais novos entram com a quantidade da planilha como estoque inicial.
 * Para materiais existentes, a quantidade só é alterada se `ajustarQuantidade` for true
 * (gera um ajuste de inventário rastreável).
 */
export function importarMateriais(linhas: Celula[][], opcoes: { ajustarQuantidade?: boolean } = {}): ResultadoImportacao {
  if (linhas.length < 2) throw new Error('A planilha está vazia. A primeira linha deve ter os títulos das colunas.')
  const cabecalho = linhas[0].map(normalizar)
  const indice: Record<string, number> = {}
  for (const [campo, nomes] of Object.entries(ALIASES)) {
    const i = cabecalho.findIndex(h => nomes.includes(h))
    if (i >= 0) indice[campo] = i
  }
  if (indice.nome === undefined) throw new Error('Não encontrei a coluna "Nome" na primeira linha da planilha.')

  const db = getDb()
  const resultado: ResultadoImportacao = { criados: 0, atualizados: 0, ajustados: 0, erros: [] }
  const categorias = new Map(listarCategorias().map(c => [c.nome.toLocaleLowerCase('pt-BR'), c.id]))
  const valor = (linha: Celula[], campo: string) => (indice[campo] === undefined ? undefined : linha[indice[campo]] ?? null)

  db.transaction(() => {
    linhas.slice(1).forEach((linha, n) => {
      const numeroLinha = n + 2
      try {
        db.transaction(() => {
          const nome = textoCelula(valor(linha, 'nome') ?? null)
          if (!nome) throw new Error('Nome vazio')
          const codigo = textoCelula(valor(linha, 'codigo') ?? null) || null

          let categoriaId: number | null | undefined
          const nomeCategoria = textoCelula(valor(linha, 'categoria') ?? null)
          if (nomeCategoria) {
            const chave = nomeCategoria.toLocaleLowerCase('pt-BR')
            if (!categorias.has(chave)) categorias.set(chave, criarCategoria({ nome: nomeCategoria }))
            categoriaId = categorias.get(chave)
          }

          const dados = {
            nome,
            codigo: indice.codigo === undefined ? undefined : codigo,
            categoria_id: categoriaId,
            unidade: textoCelula(valor(linha, 'unidade') ?? null) || undefined,
            minimo: valor(linha, 'minimo') === undefined ? undefined : numeroCelula(valor(linha, 'minimo') ?? null) ?? undefined,
            localizacao: indice.localizacao === undefined ? undefined : textoCelula(valor(linha, 'localizacao') ?? null)
          }
          const quantidade = valor(linha, 'quantidade') === undefined ? null : numeroCelula(valor(linha, 'quantidade') ?? null)

          const existente = (codigo
            ? db.prepare('SELECT id, quantidade_atual FROM produtos WHERE codigo=? COLLATE NOCASE').get(codigo)
            : undefined) ?? db.prepare('SELECT id, quantidade_atual FROM produtos WHERE nome=? COLLATE NOCASE').get(nome)

          if (existente) {
            const { id, quantidade_atual } = existente as { id: number; quantidade_atual: number }
            atualizarProduto(id, dados)
            resultado.atualizados++
            if (opcoes.ajustarQuantidade && quantidade !== null && quantidade !== quantidade_atual) {
              ajustarEstoque({ produto_id: id, quantidade_contada: quantidade, observacao: 'Importação de planilha' })
              resultado.ajustados++
            }
          } else {
            criarProduto({ ...dados, quantidade: quantidade ?? 0 })
            resultado.criados++
          }
        })()
      } catch (e) {
        resultado.erros.push({ linha: numeroLinha, mensagem: e instanceof Error ? e.message : 'Erro' })
      }
    })
  })()
  return resultado
}
