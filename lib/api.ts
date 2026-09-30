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
