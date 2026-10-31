import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { atualizarProduto, definirProdutoAtivo, excluirProduto, obterProduto } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Contexto = { params: { id: string } }

/** Ficha do material com histórico. */
export function GET(_req: Request, { params }: Contexto) {
  try {
    exigir('leitura')
    return ok(obterProduto(idDaRota(params.id)))
  } catch (e) {
    return falha(e, 404)
  }
}

export async function PATCH(req: Request, { params }: Contexto) {
  try {
    exigir('operacao')
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
        localizacao: body.localizacao,
        epi: body.epi,
        ca: body.ca,
        ca_validade: body.ca_validade,
        troca_dias: body.troca_dias
      })
    }
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}

export function DELETE(_req: Request, { params }: Contexto) {
  try {
    exigir('admin')
    excluirProduto(idDaRota(params.id))
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}
