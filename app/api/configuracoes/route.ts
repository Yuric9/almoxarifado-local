import { falha, lerJson, ok } from '@/lib/api'
import { lerConfiguracoes, salvarConfiguracoes } from '@/lib/configuracoes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return ok(lerConfiguracoes())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function PATCH(req: Request) {
  try {
    return ok(salvarConfiguracoes(await lerJson(req)))
  } catch (e) {
    return falha(e)
  }
}
