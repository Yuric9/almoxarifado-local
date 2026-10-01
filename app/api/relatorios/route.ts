import { arquivo, falha, ok, TIPO_CSV, TIPO_XLSX } from '@/lib/api'
import { gerarCsv } from '@/lib/planilha'
import { descreverOrigem, relatorioPeriodo, relatorioXlsx } from '@/lib/relatorios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD[&formato=xlsx|csv] */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams
    const r = relatorioPeriodo(q.get('inicio') || '', q.get('fim') || '')
    const nome = `relatorio-${r.inicio}_${r.fim}`
    if (q.get('formato') === 'xlsx') return arquivo(await relatorioXlsx(r), `${nome}.xlsx`, TIPO_XLSX)
    if (q.get('formato') === 'csv') {
      const csv = gerarCsv([
        ['Data (UTC)', 'Tipo', 'Material', 'Quantidade', 'Unidade', 'Origem', 'Responsável', 'Observação'],
        ...r.movimentacoes.map(m => [m.criado_em, m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída', m.produto_nome, m.quantidade, m.unidade, descreverOrigem(m), m.responsavel, m.observacao])
      ])
      return arquivo(csv, `${nome}.csv`, TIPO_CSV)
    }
    return ok(r)
  } catch (e) {
    return falha(e)
  }
}
