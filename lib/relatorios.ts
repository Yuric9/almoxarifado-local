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
