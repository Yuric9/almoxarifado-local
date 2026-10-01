import { falha, lerJson, ok } from '@/lib/api'
import { criarCategoria, listarCategorias } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return ok(listarCategorias())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    return ok({ ok: true, id: criarCategoria({ nome: body.nome, cor: body.cor }) }, 201)
  } catch (e) {
    return falha(e)
  }
}
