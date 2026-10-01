import { arquivo, falha, TIPO_XLSX } from '@/lib/api'
import { modeloImportacaoXlsx } from '@/lib/planilha'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return arquivo(await modeloImportacaoXlsx(), 'modelo-importacao-materiais.xlsx', TIPO_XLSX)
  } catch (e) {
    return falha(e, 500)
  }
}
