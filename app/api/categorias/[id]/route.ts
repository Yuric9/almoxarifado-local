import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { atualizarCategoria, excluirCategoria } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Contexto = { params: { id: string } }

export async function PATCH(req: Request, { params }: Contexto) {
  try {
    const body = await lerJson(req)
    atualizarCategoria(idDaRota(params.id), { nome: body.nome, cor: body.cor })
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}

export function DELETE(_req: Request, { params }: Contexto) {
  try {
    excluirCategoria(idDaRota(params.id))
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}
