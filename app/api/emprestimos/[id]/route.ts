import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { devolverEmprestimo, obterEmprestimo, type DevolucaoInput } from '@/lib/emprestimos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Contexto = { params: { id: string } }

export function GET(_req: Request, { params }: Contexto) {
  try {
    exigir('leitura')
    return ok(obterEmprestimo(idDaRota(params.id)))
  } catch (e) {
    return falha(e)
  }
}

/** Registra a devolução: { itens: [{ item_id, devolvida, nao_devolvida }], observacao } */
export async function POST(req: Request, { params }: Contexto) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    return ok(devolverEmprestimo(idDaRota(params.id), {
      itens: Array.isArray(body.itens) ? (body.itens as DevolucaoInput['itens']) : [],
      observacao: body.observacao
    }))
  } catch (e) {
    return falha(e)
  }
}
