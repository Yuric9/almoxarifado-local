import { falha, lerJson, ok } from '@/lib/api'
import { criarRequisicao, listarRequisicoes, type ItemInput } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return ok(listarRequisicoes())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    const id = criarRequisicao({
      retirado_por: body.retirado_por,
      setor: body.setor,
      finalidade: body.finalidade,
      entregue_por: body.entregue_por,
      observacao: body.observacao,
      itens: Array.isArray(body.itens) ? (body.itens as ItemInput[]) : []
    })
    return ok({ ok: true, id }, 201)
  } catch (e) {
    return falha(e)
  }
}
