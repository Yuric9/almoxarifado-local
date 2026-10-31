import { getDb } from './db'

/**
 * Ficha de controle de EPI (NR-6): o que cada funcionário recebeu, com o CA da época,
 * e quando cada equipamento deve ser trocado.
 * Vem das retiradas finalizadas ligadas ao funcionário; retiradas estornadas não contam.
 */

export type EntregaEpi = {
  requisicao_id: number
  numero: string
  data: string
  produto_id: number
  nome: string
  quantidade: number
  unidade: string
  ca: string | null
}

export type EpiEmUso = {
  produto_id: number
  nome: string
  ca: string | null
  ultima_entrega: string
  troca_dias: number | null
  /** AAAA-MM-DD; null quando o material não tem prazo de troca. */
  proxima_troca: string | null
  situacao: 'EM_DIA' | 'VENCE_EM_BREVE' | 'VENCIDA' | 'SEM_PRAZO'
}

export type FichaEpi = {
  funcionario: { id: number; nome: string; matricula: string | null; funcao: string | null; setor: string | null; ativo: number }
  entregas: EntregaEpi[]
  em_uso: EpiEmUso[]
}

const DIA = 86_400_000
const hojeLocal = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "2026-03-10 14:00:00" (UTC do SQLite) → data local. */
function dataLocal(utc: string) {
  const d = new Date(utc.replace(' ', 'T') + 'Z')
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function fichaEpi(funcionarioId: number, hoje = hojeLocal()): FichaEpi {
  const db = getDb()
  const funcionario = db.prepare(`
    SELECT f.id, f.nome, f.matricula, f.funcao, s.nome AS setor, f.ativo
    FROM funcionarios f LEFT JOIN setores s ON s.id=f.setor_id WHERE f.id=?
  `).get(funcionarioId) as FichaEpi['funcionario'] | undefined
  if (!funcionario) throw new Error('Funcionário não encontrado')

  const entregas = db.prepare(`
    SELECT r.id AS requisicao_id, r.numero, r.criado_em AS data, i.produto_id, i.produto_nome AS nome, i.quantidade, i.unidade,
      COALESCE(i.ca, CASE WHEN p.epi=1 THEN p.ca END) AS ca
    FROM requisicoes r
    JOIN requisicao_itens i ON i.requisicao_id=r.id
    JOIN produtos p ON p.id=i.produto_id
    WHERE r.funcionario_id=? AND r.status='FINALIZADA' AND (p.epi=1 OR i.ca IS NOT NULL)
    ORDER BY r.criado_em DESC, r.id DESC, i.id
  `).all(funcionarioId) as EntregaEpi[]

  // Situação de cada EPI: conta a partir da última entrega daquele material.
  const prazos = new Map((db.prepare('SELECT id, troca_dias FROM produtos').all() as Array<{ id: number; troca_dias: number | null }>).map(p => [p.id, p.troca_dias]))
  const vistos = new Set<number>()
  const em_uso: EpiEmUso[] = []
  for (const e of entregas) {
    if (vistos.has(e.produto_id)) continue
    vistos.add(e.produto_id)
    const troca = prazos.get(e.produto_id) ?? null
    let proxima: string | null = null
    let situacao: EpiEmUso['situacao'] = 'SEM_PRAZO'
    if (troca) {
      const limite = new Date(dataLocal(e.data).getTime() + troca * DIA)
      proxima = iso(limite)
      const faltam = Math.round((limite.getTime() - hoje.getTime()) / DIA)
      situacao = faltam < 0 ? 'VENCIDA' : faltam <= 15 ? 'VENCE_EM_BREVE' : 'EM_DIA'
    }
    em_uso.push({ produto_id: e.produto_id, nome: e.nome, ca: e.ca, ultima_entrega: e.data, troca_dias: troca, proxima_troca: proxima, situacao })
  }
  const ordem = { VENCIDA: 0, VENCE_EM_BREVE: 1, EM_DIA: 2, SEM_PRAZO: 3 }
  em_uso.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { funcionario, entregas, em_uso }
}
