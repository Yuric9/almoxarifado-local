import { arquivo, falha, TIPO_CSV, TIPO_XLSX } from '@/lib/api'
import { exportarMateriaisCsv, exportarMateriaisXlsx } from '@/lib/planilha'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Exporta todos os materiais. ?formato=xlsx (padrão) ou csv */
export async function GET(req: Request) {
  try {
    const data = new Date().toISOString().slice(0, 10)
    if (new URL(req.url).searchParams.get('formato') === 'csv') {
      return arquivo(exportarMateriaisCsv(), `materiais-${data}.csv`, TIPO_CSV)
    }
    return arquivo(await exportarMateriaisXlsx(), `materiais-${data}.xlsx`, TIPO_XLSX)
  } catch (e) {
    return falha(e, 500)
  }
}
