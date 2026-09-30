// Utilidades usadas apenas no navegador (componentes 'use client').

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...resto } = init || {}
  const res = await fetch(url, {
    ...resto,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...resto.headers } : resto.headers,
    body: json !== undefined ? JSON.stringify(json) : resto.body,
    cache: 'no-store'
  })
  const dados = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((dados as { error?: string }).error || `Erro ${res.status}`)
  return dados as T
}

export function mensagemErro(e: unknown) {
  return e instanceof Error ? e.message : 'Erro inesperado'
}

/**
 * O SQLite grava CURRENT_TIMESTAMP em UTC sem fuso ("2026-01-31 13:00:00").
 * Sem este ajuste o navegador interpretaria como horário local (3h de diferença no Brasil).
 */
export function lerData(valor: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(valor)) return new Date(valor.replace(' ', 'T') + 'Z')
  return new Date(valor)
}

export function formatarData(valor: string) {
  return lerData(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function ehHoje(valor: string) {
  return lerData(valor).toDateString() === new Date().toDateString()
}

export function formatarQtd(valor: number) {
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}
