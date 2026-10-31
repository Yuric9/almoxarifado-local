import { arquivo, falha, TIPO_XLSX } from '@/lib/api'
import { modeloImportacaoXlsx } from '@/lib/planilha'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    exigir('leitura')
    return arquivo(await modeloImportacaoXlsx(), 'modelo-importacao-materiais.xlsx', TIPO_XLSX)
  } catch (e) {
    return falha(e, 500)
  }
}
