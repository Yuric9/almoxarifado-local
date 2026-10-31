import { falha, lerJson, ok } from '@/lib/api'
import { criarReserva, listarReservas, type ItemInput } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(listarReservas())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    const id = criarReserva({
      finalidade: body.finalidade,
      reservado_por: body.reservado_por,
      observacao: body.observacao,
      itens: Array.isArray(body.itens) ? (body.itens as ItemInput[]) : []
    })
    return ok({ ok: true, id }, 201)
  } catch (e) {
    return falha(e)
  }
}
