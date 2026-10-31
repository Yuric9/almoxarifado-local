import { falha, lerJson, ok } from '@/lib/api'
import { criarRequisicao, listarRequisicoes, type ItemInput } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(listarRequisicoes())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    const id = criarRequisicao({
      retirado_por: body.retirado_por,
      funcionario_id: body.funcionario_id,
      setor: body.setor,
      setor_id: body.setor_id,
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
