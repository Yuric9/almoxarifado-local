import { falha, ok } from '@/lib/api'
import { lerDocumento } from '@/lib/documento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMITE_BYTES = 30 * 1024 * 1024

/** Lê um PDF, Word ou Excel e devolve os itens encontrados para conferência. Não grava nada. */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error('Selecione um arquivo PDF, Word ou Excel')
    if (arquivo.size > LIMITE_BYTES) throw new Error('Arquivo muito grande (máximo 30 MB)')
    return ok(await lerDocumento(Buffer.from(await arquivo.arrayBuffer()), arquivo.name))
  } catch (e) {
    return falha(e)
  }
}
