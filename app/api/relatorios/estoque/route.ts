import { arquivo, falha, ok, TIPO_CSV, TIPO_XLSX } from '@/lib/api'
import { gerarCsv } from '@/lib/planilha'
import { estoqueCsvLinhas, estoqueXlsx, relatorioEstoque } from '@/lib/relatorios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ?filtro=todos|abaixo|sem|selecionados&categoria=ID|sem&ids=1,2,3[&formato=xlsx|csv] */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams
    const ids = (q.get('ids') || '').split(',').map(Number).filter(Boolean)
    const r = relatorioEstoque({ filtro: q.get('filtro') || 'todos', categoria: q.get('categoria') || '', ids })
    const nome = `estoque-${r.filtro}-${new Date().toISOString().slice(0, 10)}`
    if (q.get('formato') === 'xlsx') return arquivo(await estoqueXlsx(r.linhas), `${nome}.xlsx`, TIPO_XLSX)
    if (q.get('formato') === 'csv') return arquivo(gerarCsv(estoqueCsvLinhas(r.linhas)), `${nome}.csv`, TIPO_CSV)
    return ok(r)
  } catch (e) {
    return falha(e)
  }
}
