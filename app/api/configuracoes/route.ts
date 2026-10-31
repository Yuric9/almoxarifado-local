import { falha, lerJson, ok } from '@/lib/api'
import { lerConfiguracoes, salvarConfiguracoes } from '@/lib/configuracoes'
import { exigir } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    exigir('leitura')
    return ok(lerConfiguracoes())
  } catch (e) {
    return falha(e, 500)
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await lerJson(req)
    // Trocar só o tema é preferência de tela: qualquer usuário pode. O resto, só o administrador.
    const soTema = Object.keys(body).every(k => k === 'tema')
    exigir(soTema ? 'leitura' : 'admin')
    return ok(salvarConfiguracoes(body))
  } catch (e) {
    return falha(e)
  }
}
