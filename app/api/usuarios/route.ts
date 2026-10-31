import { falha, lerJson, ok } from '@/lib/api'
import { criarUsuario, exigir, listarUsuarios } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('admin')
    return ok(listarUsuarios())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('admin')
    const body = await lerJson(req)
    return ok({ id: criarUsuario({ nome: body.nome, login: body.login, senha: body.senha, perfil: body.perfil }) }, 201)
  } catch (e) {
    return falha(e)
  }
}
