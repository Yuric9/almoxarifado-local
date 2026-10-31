import { falha, idDaRota, ok } from '@/lib/api'
import { obterRequisicao } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    exigir('leitura')
    return ok(obterRequisicao(idDaRota(params.id)))
  } catch (e) {
    return falha(e, 404)
  }
}
