import { NextResponse } from 'next/server'

export function ok<T>(dados: T, status = 200) {
  return NextResponse.json(dados, { status })
}

export function falha(e: unknown, status = 400) {
  const mensagem = e instanceof Error ? e.message : 'Erro inesperado'
  if (status >= 500) console.error(e)
  return NextResponse.json({ error: mensagem }, { status })
}

export function idDaRota(valor: string) {
  const id = Number(valor)
  if (!Number.isInteger(id) || id <= 0) throw new Error('Identificador inválido')
  return id
}

export async function lerJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    throw new Error('Dados enviados em formato inválido')
  }
}

export function arquivo(conteudo: Buffer | string, nome: string, tipo: string) {
  return new NextResponse(typeof conteudo === 'string' ? conteudo : new Uint8Array(conteudo), {
    headers: {
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store'
    }
  })
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const TIPO_CSV = 'text/csv; charset=utf-8'
