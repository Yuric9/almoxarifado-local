import { falha, ok } from '@/lib/api'
import { importarMateriais, lerArquivoPlanilha } from '@/lib/planilha'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMITE_BYTES = 20 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error('Selecione uma planilha (.xlsx ou .csv)')
    if (arquivo.size > LIMITE_BYTES) throw new Error('Arquivo muito grande')
    const linhas = await lerArquivoPlanilha(Buffer.from(await arquivo.arrayBuffer()), arquivo.name)
    return ok(importarMateriais(linhas, { ajustarQuantidade: form.get('ajustar_quantidade') === 'true' }))
  } catch (e) {
    return falha(e)
  }
}
