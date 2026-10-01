import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { registrarBaixa } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Baixa por perda, roubo, vencimento ou quebra. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await lerJson(req)
    registrarBaixa({
      produto_id: idDaRota(params.id),
      quantidade: body.quantidade,
      motivo: body.motivo,
      responsavel: body.responsavel,
      observacao: body.observacao
    })
    return ok({ ok: true }, 201)
  } catch (e) {
    return falha(e)
  }
}
