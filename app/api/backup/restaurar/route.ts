import { falha, ok } from '@/lib/api'
import { restaurarBackup } from '@/lib/backup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMITE_BYTES = 200 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof Blob) || arquivo.size === 0) throw new Error('Selecione um arquivo de backup (.db)')
    if (arquivo.size > LIMITE_BYTES) throw new Error('Arquivo muito grande')
    const resultado = restaurarBackup(Buffer.from(await arquivo.arrayBuffer()))
    return ok({ ok: true, ...resultado })
  } catch (e) {
    return falha(e)
  }
}
