import { NextResponse, type NextRequest } from 'next/server'

/**
 * O servidor só escuta em 127.0.0.1, mas um site aberto no navegador
 * ainda poderia tentar enviar requisições para ele. Bloqueia chamadas
 * de escrita vindas de outra origem.
 */
export function middleware(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') return NextResponse.next()
  const origem = req.headers.get('origin')
  if (origem && hostDe(origem) !== req.headers.get('host')) {
    return NextResponse.json({ error: 'Origem não permitida' }, { status: 403 })
  }
  return NextResponse.next()
}

function hostDe(url: string) {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export const config = { matcher: '/api/:path*' }
