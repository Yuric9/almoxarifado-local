import writeXlsxFile from 'write-excel-file/node'
import { getDb } from './db'
import { descreverOrigem } from './constantes'
import { listarMovimentacoes, type Movimentacao } from './repository'

export { descreverOrigem }

const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Converte uma data local (AAAA-MM-DD, meia-noite) para o formato UTC gravado pelo SQLite. */
export function limiteUtc(dataLocal: string) {
  const [a, m, d] = dataLocal.split('-').map(Number)
  return new Date(a, m - 1, d).toISOString().replace('T', ' ').slice(0, 19)
}

export function diaSeguinte(dataLocal: string) {
  const [a, m, d] = dataLocal.split('-').map(Number)
  const dt = new Date(a, m - 1, d + 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

function diaLocal(criadoEm: string) {
  const dt = new Date(criadoEm.replace(' ', 'T') + 'Z')
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export function categoriaMovimento(m: Pick<Movimentacao, 'tipo' | 'origem'>) {
  if (m.origem === 'BAIXA') return 'baixas'
  if (m.origem === 'AJUSTE') return 'ajustes'
  if (m.origem === 'ESTORNO') return 'estornos'
  return m.tipo === 'ENTRADA' ? 'entradas' : 'saidas'
}

export type LinhaMaterial = {
  produto_id: number
  nome: string
  unidade: string
  saldo_inicial: number
  entradas: number
  saidas: number
  baixas: number
  ajustes: number
  saldo_final: number
}

export function relatorioPeriodo(inicio: string, fim: string) {
  if (!DATA.test(inicio) || !DATA.test(fim)) throw new Error('Informe datas válidas')
  if (fim < inicio) throw new Error('A data final deve ser igual ou posterior à inicial')
  const de = limiteUtc(inicio)
  const ate = limiteUtc(diaSeguinte(fim))
  const db = getDb()

  const movimentacoes = listarMovimentacoes({ de, ate, limite: 5000 })

  // Saldo final = estoque atual menos tudo que aconteceu depois do período.
  const posteriores = new Map(
    (db.prepare(`
      SELECT produto_id, SUM(CASE WHEN tipo='ENTRADA' THEN quantidade ELSE -quantidade END) AS liquido
      FROM movimentacoes WHERE criado_em>=? GROUP BY produto_id
    `).all(ate) as Array<{ produto_id: number; liquido: number }>).map(r => [r.produto_id, r.liquido])
  )
  const produtos = db.prepare('SELECT id, nome, unidade, quantidade_atual FROM produtos ORDER BY nome COLLATE NOCASE')
    .all() as Array<{ id: number; nome: string; unidade: string; quantidade_atual: number }>

  const porMaterial = new Map<number, LinhaMaterial>()
  for (const p of produtos) {
    const saldoFinal = p.quantidade_atual - (posteriores.get(p.id) || 0)
    porMaterial.set(p.id, { produto_id: p.id, nome: p.nome, unidade: p.unidade, saldo_inicial: saldoFinal, entradas: 0, saidas: 0, baixas: 0, ajustes: 0, saldo_final: saldoFinal })
  }

  const porDia = new Map<string, { dia: string; entradas: number; saidas: number; baixas: number; retiradas: number }>()
  for (let d = inicio; d <= fim; d = diaSeguinte(d)) porDia.set(d, { dia: d, entradas: 0, saidas: 0, baixas: 0, retiradas: 0 })

  for (const m of movimentacoes) {
    const linha = porMaterial.get(m.produto_id)
    const sinal = m.tipo === 'ENTRADA' ? 1 : -1
    const cat = categoriaMovimento(m)
    if (linha) {
      linha.saldo_inicial -= sinal * m.quantidade
      if (cat === 'baixas') linha.baixas += m.quantidade
      else if (cat === 'ajustes') linha.ajustes += sinal * m.quantidade
      else if (m.tipo === 'ENTRADA') linha.entradas += m.quantidade
      else linha.saidas += m.quantidade
    }
    const dia = porDia.get(diaLocal(m.criado_em))
    if (dia) {
      if (cat === 'baixas') dia.baixas++
      else if (cat === 'entradas') dia.entradas++
      else if (cat === 'saidas') dia.saidas++
    }
  }

  const requisicoes = db.prepare(`
    SELECT r.id, r.numero, r.retirado_por, r.setor, r.finalidade, r.status, r.criado_em, COUNT(ri.id) AS total_itens
    FROM requisicoes r LEFT JOIN requisicao_itens ri ON ri.requisicao_id=r.id
    WHERE r.criado_em>=? AND r.criado_em<?
    GROUP BY r.id ORDER BY r.criado_em
  `).all(de, ate) as Array<{ id: number; numero: string; retirado_por: string; setor: string | null; finalidade: string | null; status: string; criado_em: string; total_itens: number }>

  for (const r of requisicoes) {
    const dia = porDia.get(diaLocal(r.criado_em))
    if (dia && r.status === 'FINALIZADA') dia.retiradas++
  }

  const materiais = Array.from(porMaterial.values()).filter(l => l.entradas || l.saidas || l.baixas || l.ajustes || l.saldo_final)
  return {
    inicio,
    fim,
    resumo: {
      movimentacoes: movimentacoes.length,
      entradas: movimentacoes.filter(m => categoriaMovimento(m) === 'entradas').length,
      saidas: movimentacoes.filter(m => categoriaMovimento(m) === 'saidas').length,
      baixas: movimentacoes.filter(m => categoriaMovimento(m) === 'baixas').length,
      retiradas: requisicoes.filter(r => r.status === 'FINALIZADA').length,
      materiais_movimentados: materiais.filter(l => l.entradas || l.saidas || l.baixas || l.ajustes).length
    },
    materiais,
    dias: Array.from(porDia.values()),
    requisicoes,
    movimentacoes: movimentacoes.slice().reverse()
  }
}

export type Relatorio = ReturnType<typeof relatorioPeriodo>

export async function relatorioXlsx(r: Relatorio) {
  const negrito = (value: string) => ({ value, fontWeight: 'bold' as const })
  const resumo = [
    ['Materiais', 'Unidade', 'Saldo inicial', 'Entradas', 'Saídas', 'Baixas', 'Ajustes', 'Saldo final'].map(negrito),
    ...r.materiais.map(l => [l.nome, l.unidade, l.saldo_inicial, l.entradas, l.saidas, l.baixas, l.ajustes, l.saldo_final].map(value => ({ value })))
  ]
  const movs = [
    ['Data (UTC)', 'Tipo', 'Material', 'Quantidade', 'Unidade', 'Origem', 'Responsável', 'Observação'].map(negrito),
    ...r.movimentacoes.map(m => [m.criado_em, m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída', m.produto_nome, m.quantidade, m.unidade, descreverOrigem(m), m.responsavel || '', m.observacao || '']
      .map(value => ({ value })))
  ]
  const dias = [
    ['Dia', 'Entradas', 'Saídas', 'Baixas', 'Retiradas'].map(negrito),
    ...r.dias.map(d => [d.dia, d.entradas, d.saidas, d.baixas, d.retiradas].map(value => ({ value })))
  ]
  return writeXlsxFile([
    { data: resumo, sheet: 'Por material', columns: [{ width: 36 }, { width: 10 }, ...Array(6).fill({ width: 13 })] },
    { data: dias, sheet: 'Por dia', columns: [{ width: 12 }, ...Array(4).fill({ width: 11 })] },
    { data: movs, sheet: 'Movimentações', columns: [{ width: 20 }, { width: 9 }, { width: 36 }, { width: 12 }, { width: 9 }, { width: 26 }, { width: 20 }, { width: 40 }] }
  ]).toBuffer()
}

/* ------------------------------------------------------------------ relatório de estoque (listas) */

export type FiltroEstoque = 'todos' | 'abaixo' | 'sem' | 'selecionados'

export const FILTROS_ESTOQUE: Record<FiltroEstoque, string> = {
  todos: 'Todos os materiais',
  abaixo: 'Abaixo do mínimo',
  sem: 'Sem estoque',
  selecionados: 'Materiais selecionados'
}

export type LinhaEstoque = {
  id: number
  codigo: string | null
  nome: string
  categoria: string | null
  localizacao: string | null
  quantidade: number
  reservada: number
  unidade: string
  minimo: number
  situacao: 'Sem estoque' | 'Abaixo do mínimo' | 'Normal'
}

/**
 * Lista de materiais ativos para conferência e impressão.
 * - filtro: todos, abaixo do mínimo (inclui os zerados), sem estoque ou só os selecionados (ids);
 * - categoria: id da categoria, "sem" (sem categoria) ou vazio (todas).
 * Ordenado por categoria e nome, para sair agrupado.
 */
export function relatorioEstoque(opcoes: { filtro?: string; categoria?: string; ids?: number[] }) {
  const filtro = (opcoes.filtro && opcoes.filtro in FILTROS_ESTOQUE ? opcoes.filtro : 'todos') as FiltroEstoque
  const condicoes = ['p.ativo=1']
  const parametros: Array<string | number> = []
  if (filtro === 'abaixo') condicoes.push('p.quantidade_atual <= p.estoque_minimo')
  if (filtro === 'sem') condicoes.push('p.quantidade_atual <= 0')
  if (filtro === 'selecionados') {
    const ids = (opcoes.ids ?? []).filter(n => Number.isInteger(n) && n > 0)
    if (!ids.length) return { filtro, linhas: [] as LinhaEstoque[] }
    condicoes.push(`p.id IN (${ids.map(() => '?').join(',')})`)
    parametros.push(...ids)
  }
  if (opcoes.categoria === 'sem') condicoes.push('p.categoria_id IS NULL')
  else if (opcoes.categoria) { condicoes.push('p.categoria_id=?'); parametros.push(Number(opcoes.categoria)) }

  const linhas = getDb().prepare(`
    SELECT p.id, p.codigo, p.nome, c.nome AS categoria, p.localizacao, p.quantidade_atual AS quantidade,
      COALESCE((SELECT SUM(ri.quantidade) FROM reserva_itens ri JOIN reservas r ON r.id=ri.reserva_id
                WHERE ri.produto_id=p.id AND r.status IN ('SEPARADO','AGUARDANDO_RETIRADA')), 0) AS reservada,
      p.unidade, p.estoque_minimo AS minimo
    FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id
    WHERE ${condicoes.join(' AND ')}
    ORDER BY c.nome IS NULL, c.nome COLLATE NOCASE, p.nome COLLATE NOCASE
  `).all(...parametros) as Array<Omit<LinhaEstoque, 'situacao'>>

  return {
    filtro,
    linhas: linhas.map(l => ({
      ...l,
      situacao: (l.quantidade <= 0 ? 'Sem estoque' : l.quantidade <= l.minimo ? 'Abaixo do mínimo' : 'Normal') as LinhaEstoque['situacao']
    }))
  }
}

const COLUNAS_ESTOQUE = ['Categoria', 'Código', 'Material', 'Quantidade', 'Unidade', 'Mínimo', 'Situação', 'Localização']
const valoresEstoque = (l: LinhaEstoque) => [l.categoria || 'Sem categoria', l.codigo || '', l.nome, l.quantidade, l.unidade, l.minimo, l.situacao, l.localizacao || '']

export function estoqueCsvLinhas(linhas: LinhaEstoque[]) {
  return [COLUNAS_ESTOQUE, ...linhas.map(valoresEstoque)]
}

export async function estoqueXlsx(linhas: LinhaEstoque[]) {
  const dados = [
    COLUNAS_ESTOQUE.map(value => ({ value, fontWeight: 'bold' as const })),
    ...linhas.map(l => valoresEstoque(l).map(value => ({ value })))
  ]
  return writeXlsxFile(dados, {
    sheet: 'Estoque',
    columns: [{ width: 22 }, { width: 12 }, { width: 48 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 18 }, { width: 22 }]
  }).toBuffer()
}
