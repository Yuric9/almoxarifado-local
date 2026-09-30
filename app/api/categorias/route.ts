import { falha, ok } from '@/lib/api'
import { listarCategorias } from '@/lib/repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return ok(listarCategorias())
  } catch (e) {
    return falha(e, 500)
  }
}
