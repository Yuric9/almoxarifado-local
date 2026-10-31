// Constantes compartilhadas entre servidor e interface (sem dependências de servidor).

export const UNIDADES = ['UN', 'PC', 'PAR', 'CJ', 'KG', 'G', 'CX', 'PCT', 'PT', 'L', 'ML', 'M', 'M²', 'M³', 'RL', 'SC', 'LT', 'GL', 'BL', 'BR', 'MIL'] as const

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
  IMPORTACAO: 'Entrada por documento',
  MANUAL: 'Manual'
}

export function descreverOrigem(m: { origem: string; motivo: string | null }) {
  const base = ORIGENS[m.origem] || m.origem
  if (m.origem === 'BAIXA' && m.motivo) return `${base} · ${MOTIVOS_BAIXA[m.motivo as MotivoBaixa] || m.motivo}`
  return base
}

/** Grafias comuns de unidade → sigla do sistema (UND → UN, M3 → M³, SACO → SC…). */
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

/** Perfis de acesso. ADMIN faz tudo; ALMOXARIFE movimenta o estoque; CONSULTA só vê e tira relatórios. */
export const PERFIS = {
  ADMIN: 'Administrador',
  ALMOXARIFE: 'Almoxarife',
  CONSULTA: 'Consulta'
} as const
export type Perfil = keyof typeof PERFIS

/** Situação do CA (Certificado de Aprovação) de um EPI: vencido, vencendo em até 30 dias ou em dia (null). */
export function situacaoCa(p: { epi: number; ca_validade: string | null }, hoje = new Date()): 'VENCIDO' | 'VENCE_EM_BREVE' | null {
  if (!p.epi || !p.ca_validade) return null
  const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  if (p.ca_validade < d(hoje)) return 'VENCIDO'
  const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30)
  return p.ca_validade <= d(limite) ? 'VENCE_EM_BREVE' : null
}

/** "2027-05-01" → "01/05/2027". */
export const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
