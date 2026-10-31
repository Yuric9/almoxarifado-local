import { falha, lerJson, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { iniciarInventario, listarInventarios } from '@/lib/inventario'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(listarInventarios())
  } catch (e) {
    return falha(e, 500)
  }
}

/** Inicia um inventário: { descricao, categoria_id, localizacao, responsavel } */
export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    const id = iniciarInventario({ descricao: body.descricao, categoria_id: body.categoria_id, localizacao: body.localizacao, responsavel: body.responsavel })
    return ok({ ok: true, id }, 201)
  } catch (e) {
    return falha(e)
  }
}
