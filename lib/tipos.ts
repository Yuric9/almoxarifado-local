// Tipos compartilhados entre API e interface (sem dependências de servidor).
export type { Categoria, Produto, Movimentacao, Requisicao, Reserva, ItemDocumento, StatusReserva } from './repository'
export type { Configuracoes, Tema } from './configuracoes'
export type { Relatorio, LinhaEstoque, GrupoConsumo } from './relatorios'
export type { Setor, Funcionario } from './pessoas'
export type { FichaEpi, EpiEmUso, EntregaEpi } from './epi'
export type { Emprestimo, EmprestimoDetalhe, ItemEmprestimo, StatusEmprestimo } from './emprestimos'
export type { ResultadoImportacao } from './planilha'
export type { DocumentoLido } from './documento'
export type { Usuario } from './auth'
export type { ItemClassificacao, Sugestao as SugestaoCategoria } from './classificacao'
export { UNIDADES, MOTIVOS_BAIXA, ORIGENS, PERFIS, descreverOrigem, situacaoCa, dataBr, type MotivoBaixa, type Perfil } from './constantes'
import type { Categoria, ItemDocumento, Movimentacao, Produto, Requisicao, Reserva, StatusReserva } from './repository'

export type CategoriaResumo = Categoria & { total_materiais: number }
export type RequisicaoResumo = Requisicao & { total_itens: number }
export type ReservaResumo = Reserva & { total_itens: number }
export type RequisicaoDetalhe = Requisicao & { itens: ItemDocumento[] }
export type ReservaDetalhe = Reserva & { itens: ItemDocumento[]; requisicao_id: number | null }
export type ProdutoFicha = Produto & {
  movimentacoes: Movimentacao[]
  reservas: Array<{ id: number; numero: string; finalidade: string; status: StatusReserva; quantidade: number }>
}

export type Sistema = {
  versao: string
  modo: 'portatil' | 'instalado' | 'desenvolvimento'
  pasta_dados: string
  banco: string
  backup_automatico: string | null
}
