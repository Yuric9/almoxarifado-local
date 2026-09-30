'use client'
import { useEffect, useId, type ReactNode } from 'react'

export function Modal({ titulo, subtitulo, aoFechar, largura = 'max-w-lg', children }: {
  titulo: string
  subtitulo?: string
  aoFechar: () => void
  largura?: string
  children: ReactNode
}) {
  const tituloId = useId()
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center print:hidden" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={tituloId} className={`max-h-[92vh] w-full overflow-auto rounded-[28px] bg-white p-6 md:p-8 ${largura}`}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id={tituloId} className="text-2xl font-black">{titulo}</h2>
            {subtitulo && <p className="text-zinc-500">{subtitulo}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="text-3xl leading-none text-zinc-400 hover:text-zinc-900">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({ rotulo, opcional, children }: { rotulo: string; opcional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">
        {rotulo} {opcional && <span className="font-normal text-zinc-400">(opcional)</span>}
      </span>
      {children}
    </label>
  )
}

export const classeInput = 'h-12 w-full rounded-xl border-2 border-zinc-200 bg-white px-4 text-lg outline-none focus:border-blue-500'

export function Acoes({ aoCancelar, rotuloConfirmar, cor = 'bg-zinc-900 hover:bg-black', enviando }: {
  aoCancelar: () => void
  rotuloConfirmar: string
  cor?: string
  enviando?: boolean
}) {
  return (
    <div className="mt-6 flex gap-3">
      <button type="button" onClick={aoCancelar} className="h-14 flex-1 rounded-xl border-2 text-lg font-bold hover:bg-zinc-50">Cancelar</button>
      <button type="submit" disabled={enviando} className={`h-14 flex-1 rounded-xl text-lg font-bold text-white disabled:opacity-60 ${cor}`}>
        {enviando ? 'Salvando…' : rotuloConfirmar}
      </button>
    </div>
  )
}
