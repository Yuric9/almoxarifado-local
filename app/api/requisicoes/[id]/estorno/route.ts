import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { estornarRequisicao } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Desfaz uma retirada lançada por engano e devolve o material ao estoque. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    exigir('admin')
    const body = await lerJson(req)
    estornarRequisicao(idDaRota(params.id), body.motivo)
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}
