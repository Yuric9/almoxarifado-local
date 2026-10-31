import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { atualizarFuncionario } from '@/lib/pessoas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    atualizarFuncionario(idDaRota(params.id), { nome: body.nome, matricula: body.matricula, funcao: body.funcao, setor_id: body.setor_id, ativo: body.ativo })
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}
