// Constantes compartilhadas entre servidor e interface (sem dependências de servidor).

export const UNIDADES = ['UN', 'KG', 'G', 'CX', 'PCT', 'PAR', 'L', 'ML', 'M', 'M²', 'M³', 'RL', 'SC', 'LT', 'GL'] as const

export const MOTIVOS_BAIXA = {
  PERDA: 'Perda',
  ROUBO: 'Roubo / furto',
  VENCIDO: 'Vencido',
  QUEBRADO: 'Quebrado / danificado',
  OUTRO: 'Outro'
} as const
export type MotivoBaixa = keyof typeof MOTIVOS_BAIXA

export const ORIGENS: Record<string, string> = {
  ESTOQUE_INICIAL: 'Estoque inicial',
  ENTRADA_MANUAL: 'Entrada',
  REQUISICAO: 'Retirada',
  RESERVA: 'Retirada de reserva',
  BAIXA: 'Baixa',
  AJUSTE: 'Ajuste de inventário',
  ESTORNO: 'Estorno de retirada',
  MANUAL: 'Manual'
}

export function descreverOrigem(m: { origem: string; motivo: string | null }) {
  const base = ORIGENS[m.origem] || m.origem
  if (m.origem === 'BAIXA' && m.motivo) return `${base} · ${MOTIVOS_BAIXA[m.motivo as MotivoBaixa] || m.motivo}`
  return base
}
