import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { ajustarEstoque } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ajuste de inventário pela quantidade contada fisicamente. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    exigir('admin')
    const body = await lerJson(req)
    const diferenca = ajustarEstoque({
      produto_id: idDaRota(params.id),
      quantidade_contada: body.quantidade_contada,
      responsavel: body.responsavel,
      observacao: body.observacao
    })
    return ok({ ok: true, diferenca }, 201)
  } catch (e) {
    return falha(e)
  }
}
