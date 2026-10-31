import { falha, lerJson, ok } from '@/lib/api'
import { criarCategoria, listarCategorias } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(listarCategorias())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    return ok({ ok: true, id: criarCategoria({ nome: body.nome, cor: body.cor }) }, 201)
  } catch (e) {
    return falha(e)
  }
}
