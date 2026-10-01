import { falha, lerJson, ok } from '@/lib/api'
import { listarMovimentacoes, registrarEntrada } from '@/lib/repository'
import { diaSeguinte, limiteUtc } from '@/lib/relatorios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Filtros opcionais: ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&tipo=ENTRADA|SAIDA&produto_id=1&limite=500 */
export function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams
    const inicio = q.get('inicio')
    const fim = q.get('fim')
    const tipo = q.get('tipo')
    return ok(listarMovimentacoes({
      de: inicio && DATA.test(inicio) ? limiteUtc(inicio) : undefined,
      ate: fim && DATA.test(fim) ? limiteUtc(diaSeguinte(fim)) : undefined,
      tipo: tipo === 'ENTRADA' || tipo === 'SAIDA' ? tipo : undefined,
      produto_id: Number(q.get('produto_id')) || undefined,
      limite: Number(q.get('limite')) || 300
    }))
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
