import { falha, lerJson, ok } from '@/lib/api'
import { criarProduto, listarProdutos } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return ok(listarProdutos())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    const id = criarProduto({
      nome: body.nome,
      categoria_id: body.categoria_id,
      quantidade: body.quantidade,
      minimo: body.minimo,
      unidade: body.unidade,
      codigo: body.codigo,
      localizacao: body.localizacao
    })
    return ok({ ok: true, id }, 201)
  } catch (e) {
    return falha(e)
  }
}
