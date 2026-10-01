'use client'
import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { mensagemErro } from '@/lib/cliente'
import { X } from 'lucide-react'

/* ------------------------------------------------------------------ botões */

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-blue-700 text-white hover:bg-blue-800 border-blue-700',
  secundario: 'bg-superficie text-slate-700 hover:bg-slate-50 border-slate-300',
  perigo: 'bg-superficie text-red-700 hover:bg-red-50 border-slate-300',
  fantasma: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent'
}

export function Botao({ variante = 'secundario', icone, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante
  icone?: ReactNode
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
    >
      {icone}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ formulários */

/** Campo sem largura definida (para barras de filtro). */
export const classeCampo =
  'h-9 rounded-md border border-slate-300 bg-superficie px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20'

export const classeInput = `${classeCampo} w-full`

export function Campo({ rotulo, opcional, children, className = '' }: { rotulo: string; opcional?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {rotulo}
        {opcional && <span className="ml-1 font-normal text-slate-400">(opcional)</span>}
      </span>
      {children}
    </label>
  )
}

export const classeTextarea =
  'min-h-[72px] w-full rounded-md border border-slate-300 bg-superficie px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20'

/** Controla o estado "enviando" e o erro exibido dentro de um formulário. */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  async function executar(acao: () => Promise<void>) {
    setEnviando(true)
    setErro('')
    try {
      await acao()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  }
  return { enviando, erro, setErro, executar }
}

export function AvisoErro({ texto }: { texto: string }) {
  if (!texto) return null
  return <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{texto}</p>
}

/* ------------------------------------------------------------------ modal */

/** Esc fecha apenas o diálogo que está por cima (modais podem se empilhar). */
export function useFecharComEsc(id: string, aoFechar: () => void) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const dialogos = document.querySelectorAll('[data-dialogo]')
      if (dialogos[dialogos.length - 1]?.getAttribute('data-dialogo') === id) aoFechar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [id, aoFechar])
}

export function Modal({ titulo, descricao, aoFechar, largura = 'max-w-lg', rodape, children }: {
  titulo: string
  descricao?: string
  aoFechar: () => void
  largura?: string
  rodape?: ReactNode
  children: ReactNode
}) {
  const tituloId = useId()
  useFecharComEsc(tituloId, aoFechar)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={tituloId} data-dialogo={tituloId} className={`flex max-h-[90vh] w-full flex-col rounded-lg bg-superficie shadow-xl ${largura}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={tituloId} className="text-base font-semibold text-slate-900">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{rodape}</div>}
      </div>
    </div>
  )
}

/** Modal com <form>: o rodapé fica dentro do form para o Enter enviar. */
export function ModalFormulario({ titulo, descricao, aoFechar, largura, aoEnviar, rotuloEnviar, enviando, children }: {
  titulo: string
  descricao?: string
  aoFechar: () => void
  largura?: string
  aoEnviar: (e: React.FormEvent) => void
  rotuloEnviar: string
  enviando?: boolean
  children: ReactNode
}) {
  return (
    <Modal titulo={titulo} descricao={descricao} aoFechar={aoFechar} largura={largura}>
      <form onSubmit={aoEnviar} className="space-y-4">
        {children}
        <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={enviando}>{enviando ? 'Salvando…' : rotuloEnviar}</Botao>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ exibição */

type Tom = 'neutro' | 'azul' | 'verde' | 'amarelo' | 'vermelho'

const TONS: Record<Tom, string> = {
  neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  azul: 'bg-blue-50 text-blue-800 ring-blue-200',
  verde: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amarelo: 'bg-amber-50 text-amber-800 ring-amber-200',
  vermelho: 'bg-red-50 text-red-800 ring-red-200'
}

export function Badge({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONS[tom]}`}>{children}</span>
}

export function Painel({ titulo, acoes, children, semPadding }: { titulo?: string; acoes?: ReactNode; children: ReactNode; semPadding?: boolean }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-superficie">
      {(titulo || acoes) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          {titulo && <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>}
          {acoes && <div className="flex items-center gap-2">{acoes}</div>}
        </div>
      )}
      <div className={semPadding ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

export function Tabela({ colunas, vazio, children }: {
  colunas: Array<{ titulo: string; alinhar?: 'direita'; largura?: string }>
  vazio?: string
  children: ReactNode
}) {
  const semLinhas = Array.isArray(children) ? children.length === 0 : !children
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            {colunas.map(c => (
              <th key={c.titulo} className={`px-4 py-2.5 ${c.alinhar === 'direita' ? 'text-right' : ''} ${c.largura || ''}`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {semLinhas && vazio && <p className="px-4 py-10 text-center text-sm text-slate-500">{vazio}</p>}
    </div>
  )
}

export const celula = 'px-4 py-2.5 align-middle'
export const celulaNumero = 'px-4 py-2.5 text-right tabular-nums align-middle'

export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}
