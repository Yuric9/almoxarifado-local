// Tipos compartilhados entre API e interface (sem dependências de servidor).
export type { Categoria, Produto, Movimentacao, Requisicao, Reserva, ItemDocumento, StatusReserva } from './repository'
import type { ItemDocumento, Requisicao, Reserva } from './repository'

export type RequisicaoResumo = Requisicao & { total_itens: number }
export type ReservaResumo = Reserva & { total_itens: number }
export type RequisicaoDetalhe = Requisicao & { itens: ItemDocumento[] }

export type Sistema = {
  versao: string
  modo: 'portatil' | 'instalado' | 'desenvolvimento'
  pasta_dados: string
  banco: string
  backup_automatico: string | null
}

export const UNIDADES = ['UN', 'KG', 'CX', 'PAR', 'L', 'M', 'PCT', 'RL'] as const
