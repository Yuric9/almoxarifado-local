import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { atualizarStatusReserva, cancelarReserva, obterReserva, retirarReserva } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Contexto = { params: { id: string } }

export function GET(_req: Request, { params }: Contexto) {
  try {
    return ok(obterReserva(idDaRota(params.id)))
  } catch (e) {
    return falha(e, 404)
  }
}

/** Retira o pedido reservado: baixa o estoque e gera uma requisição. */
export async function POST(req: Request, { params }: Contexto) {
  try {
    const body = await lerJson(req)
    const requisicaoId = retirarReserva(idDaRota(params.id), body.retirado_por)
    return ok({ ok: true, requisicao_id: requisicaoId })
  } catch (e) {
    return falha(e)
  }
}

export async function PATCH(req: Request, { params }: Contexto) {
  try {
    const body = await lerJson(req)
    atualizarStatusReserva(idDaRota(params.id), body.status)
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}

export function DELETE(_req: Request, { params }: Contexto) {
  try {
    cancelarReserva(idDaRota(params.id))
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}
