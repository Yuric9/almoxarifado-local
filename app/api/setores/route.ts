import { falha, lerJson, ok } from '@/lib/api'
import { exigir } from '@/lib/auth'
import { criarSetor, listarSetores } from '@/lib/pessoas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(listarSetores())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    exigir('operacao')
    const body = await lerJson(req)
    return ok({ id: criarSetor({ nome: body.nome, tipo: body.tipo }) }, 201)
  } catch (e) {
    return falha(e)
  }
}
