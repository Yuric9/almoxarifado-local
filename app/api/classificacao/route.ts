import { falha, lerJson, ok } from '@/lib/api'
import { FONTE_REFERENCIA, aplicarClassificacao, classificarMateriais, classificarNome } from '@/lib/classificacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ?nome=… sugere a categoria de um nome; sem nome, lista os materiais a classificar (?todos=1 inclui os já classificados). */
export function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const nome = url.searchParams.get('nome')
    if (nome !== null) return ok({ sugestao: nome.trim() ? classificarNome(nome) : null })
    return ok({ fonte: FONTE_REFERENCIA, itens: classificarMateriais(url.searchParams.get('todos') === '1') })
  } catch (e) {
    return falha(e, 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    return ok(aplicarClassificacao({ itens: body.itens }))
  } catch (e) {
    return falha(e)
  }
}
