import { arquivo, falha, ok, TIPO_CSV, TIPO_XLSX } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { gerarCsv } from '@/lib/planilha'
import { consumoLinhas, consumoXlsx, relatorioConsumo } from '@/lib/relatorios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&agrupar=setor|funcionario[&formato=xlsx|csv] */
export async function GET(req: Request) {
  try {
    exigir('leitura')
    const q = new URL(req.url).searchParams
    const agrupar = q.get('agrupar') === 'funcionario' ? 'funcionario' : 'setor'
    const r = relatorioConsumo(q.get('inicio') || '', q.get('fim') || '', agrupar)
    const nome = `consumo-por-${agrupar}-${r.inicio}_${r.fim}`
    if (q.get('formato') === 'xlsx') return arquivo(await consumoXlsx(r.grupos, agrupar), `${nome}.xlsx`, TIPO_XLSX)
    if (q.get('formato') === 'csv') return arquivo(gerarCsv(consumoLinhas(r.grupos, agrupar)), `${nome}.csv`, TIPO_CSV)
    return ok(r)
  } catch (e) {
    return falha(e)
  }
}
