import { falha, lerJson, ok } from '@/lib/api'
import { corrigirUnidadesGrudadas } from '@/lib/classificacao'
import { criarProduto, listarProdutos } from '@/lib/repository'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let unidadesConferidas = false

export function GET() {
  try {
    exigir('leitura')
    // Uma vez por abertura do sistema: corrige unidades que vieram com a categoria junto.
    if (!unidadesConferidas) {
      corrigirUnidadesGrudadas()
      unidadesConferidas = true
    }
    return ok(listarProdutos())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    const id = criarProduto({
      nome: body.nome,
      categoria_id: body.categoria_id,
      quantidade: body.quantidade,
      minimo: body.minimo,
      unidade: body.unidade,
      codigo: body.codigo,
      localizacao: body.localizacao,
      epi: body.epi,
      ca: body.ca,
      ca_validade: body.ca_validade,
      troca_dias: body.troca_dias
    })
    return ok({ ok: true, id }, 201)
  } catch (e) {
    return falha(e)
  }
}
