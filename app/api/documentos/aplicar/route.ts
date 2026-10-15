import { falha, lerJson, ok } from '@/lib/api'
import { aplicarImportacao } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Grava os itens conferidos: cria materiais novos e, no modo "entrada", soma ao estoque. */
export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    return ok(aplicarImportacao({ modo: body.modo, itens: body.itens, observacao: body.observacao, responsavel: body.responsavel }), 201)
  } catch (e) {
    return falha(e)
  }
}
