import { falha, lerJson, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { criarFuncionario, listarFuncionarios } from '@/lib/pessoas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(listarFuncionarios())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    return ok({ id: criarFuncionario({ nome: body.nome, matricula: body.matricula, funcao: body.funcao, setor_id: body.setor_id }) }, 201)
  } catch (e) {
    return falha(e)
  }
}
