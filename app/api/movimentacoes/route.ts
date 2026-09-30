import { falha, lerJson, ok } from '@/lib/api'
import { listarMovimentacoes, registrarEntrada } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return ok(listarMovimentacoes())
  } catch (e) {
    return falha(e, 500)
  }
}

/** Apenas entradas. Saídas são registradas por requisição ou retirada de reserva. */
export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    if (body.tipo && body.tipo !== 'ENTRADA') {
      throw new Error('Saídas devem ser registradas por uma requisição de retirada')
    }
    registrarEntrada({
      produto_id: body.produto_id,
      quantidade: body.quantidade,
      responsavel: body.responsavel,
      observacao: body.observacao
    })
    return ok({ ok: true }, 201)
  } catch (e) {
    return falha(e)
  }
}
