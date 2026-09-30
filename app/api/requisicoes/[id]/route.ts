import { falha, idDaRota, ok } from '@/lib/api'
import { obterRequisicao } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    return ok(obterRequisicao(idDaRota(params.id)))
  } catch (e) {
    return falha(e, 404)
  }
}
