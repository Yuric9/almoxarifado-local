import { falha, idDaRota, lerJson, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { cancelarInventario, finalizarInventario, obterInventario, salvarContagem } from '@/lib/inventario'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Contexto = { params: { id: string } }

export function GET(_req: Request, { params }: Contexto) {
  try {
    exigir('leitura')
    return ok(obterInventario(idDaRota(params.id)))
  } catch (e) {
    return falha(e)
  }
}

/** Salva a contagem: { contagens: [{ item_id, quantidade_contada }], responsavel, observacao } */
export async function PATCH(req: Request, { params }: Contexto) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    salvarContagem(idDaRota(params.id), { contagens: body.contagens, responsavel: body.responsavel, observacao: body.observacao })
    return ok({ ok: true })
  } catch (e) {
    return falha(e)
  }
}

/** { acao: 'finalizar' | 'cancelar' } — mexe no estoque, então só administrador. */
export async function POST(req: Request, { params }: Contexto) {
  try {
    exigir('admin')
    const id = idDaRota(params.id)
    const body = await lerJson(req)
    if (body.acao === 'finalizar') return ok(finalizarInventario(id))
    if (body.acao === 'cancelar') { cancelarInventario(id); return ok({ ok: true }) }
    throw new Error('Ação inválida')
  } catch (e) {
    return falha(e)
  }
}
