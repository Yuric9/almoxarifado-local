import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { atualizarUsuario, exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Muda nome, perfil, ativo/inativo ou define nova senha. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    exigir('admin')
    const body = await lerJson(req)
    atualizarUsuario(idDaRota(params.id), { nome: body.nome, perfil: body.perfil, ativo: body.ativo, senha: body.senha })
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}
