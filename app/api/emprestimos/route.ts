import { falha, lerJson, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { criarEmprestimo, listarEmprestimos } from '@/lib/emprestimos'
import type { ItemInput } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(listarEmprestimos())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    const id = criarEmprestimo({
      funcionario_id: body.funcionario_id,
      retirado_por: body.retirado_por,
      setor_id: body.setor_id,
      setor: body.setor,
      previsao_devolucao: body.previsao_devolucao,
      observacao: body.observacao,
      itens: Array.isArray(body.itens) ? (body.itens as ItemInput[]) : []
    })
    return ok({ ok: true, id }, 201)
  } catch (e) {
    return falha(e)
  }
}
