import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { atualizarProduto, definirProdutoAtivo, excluirProduto, obterProduto } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Contexto = { params: { id: string } }

/** Ficha do material com histórico. */
export function GET(_req: Request, { params }: Contexto) {
  try {
    return ok(obterProduto(idDaRota(params.id)))
  } catch (e) {
    return falha(e, 404)
  }
}

export async function PATCH(req: Request, { params }: Contexto) {
  try {
    const id = idDaRota(params.id)
    const body = await lerJson(req)
    if (typeof body.ativo === 'boolean') definirProdutoAtivo(id, body.ativo)
    else {
      atualizarProduto(id, {
        nome: body.nome,
        categoria_id: body.categoria_id,
        minimo: body.minimo,
        unidade: body.unidade,
        codigo: body.codigo,
        localizacao: body.localizacao
      })
    }
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}

export function DELETE(_req: Request, { params }: Contexto) {
  try {
    excluirProduto(idDaRota(params.id))
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}
