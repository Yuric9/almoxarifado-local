import { falha, idDaRota, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { fichaEpi } from '@/lib/epi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ficha de controle de EPI do funcionário. */
export function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    exigir('leitura')
    return ok(fichaEpi(idDaRota(params.id)))
  } catch (e) {
    return falha(e)
  }
}
