'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { formatarQtd } from '@/lib/cliente'
import type { Produto } from '@/lib/tipos'
import { classeInput } from './ui'

const LIMITE = 60

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

/**
 * Campo para escolher um material digitando parte do nome ou do código.
 * Cada palavra digitada precisa aparecer no nome ou no código ("abra 260" acha "ABRAÇADEIRA 260").
 * Teclado: ↑ ↓ para navegar, Enter para escolher, Esc para fechar.
 */
export function SeletorMaterial({ produtos, valor, aoMudar, mostrarDisponivel = false, rotuloVazio, autoFocus, ariaLabel = 'Material', compacto = false }: {
  produtos: Produto[]
  /** Id do material escolhido ('' = nenhum). */
  valor: string
  aoMudar: (id: string) => void
  /** Mostra o disponível (estoque menos reservas) em vez do estoque físico. */
  mostrarDisponivel?: boolean
  /** Se informado, aparece como primeira opção e representa o valor vazio (ex.: "+ Criar material novo"). */
  rotuloVazio?: string
  autoFocus?: boolean
  ariaLabel?: string
  compacto?: boolean
}) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [ativo, setAtivo] = useState(0)
  const [posicao, setPosicao] = useState<{ left: number; top: number; width: number; acima: boolean } | null>(null)

  const escolhido = produtos.find(p => String(p.id) === valor)
  const quantidade = (p: Produto) => `${formatarQtd(mostrarDisponivel ? p.quantidade_disponivel : p.quantidade_atual)} ${p.unidade}`

  const resultados = useMemo(() => {
    const palavras = semAcento(texto).split(/\s+/).filter(Boolean)
    if (!palavras.length) return produtos.slice(0, LIMITE)
    return produtos.filter(p => {
      const alvo = semAcento(`${p.nome} ${p.codigo ?? ''}`)
      return palavras.every(w => alvo.includes(w))
    }).slice(0, LIMITE)
  }, [produtos, texto])

  const opcoes: Array<{ id: string; produto?: Produto }> = [...(rotuloVazio ? [{ id: '' }] : []), ...resultados.map(p => ({ id: String(p.id), produto: p }))]

  // A lista fica "por cima" da tela (position: fixed) para não ser cortada por janelas com rolagem.
  function medir() {
    const r = campo.current?.getBoundingClientRect()
    if (!r) return
    const acima = window.innerHeight - r.bottom < 280 && r.top > 280
    setPosicao({ left: r.left, top: acima ? r.top : r.bottom, width: Math.max(r.width, 360), acima })
  }

  useEffect(() => {
    if (!aberto) return
    medir()
    const atualizar = () => medir()
    window.addEventListener('resize', atualizar)
    window.addEventListener('scroll', atualizar, true)
    return () => { window.removeEventListener('resize', atualizar); window.removeEventListener('scroll', atualizar, true) }
  }, [aberto])

  useEffect(() => { lista.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: 'nearest' }) }, [ativo])

  function abrir() {
    setTexto('')
    setAtivo(0)
    setAberto(true)
  }

  function escolher(novo: string) {
    aoMudar(novo)
    setAberto(false)
    setTexto('')
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!aberto) abrir(); else setAtivo(a => Math.min(a + 1, opcoes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && aberto) { e.preventDefault(); if (opcoes[ativo]) escolher(opcoes[ativo].id) }
    else if (e.key === 'Escape' && aberto) { e.preventDefault(); e.stopPropagation(); setAberto(false); setTexto('') }
  }

  const exibido = aberto ? texto : escolhido ? escolhido.nome : valor === '' && rotuloVazio ? rotuloVazio : ''

  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={campo}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={aberto}
        aria-controls={id}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={exibido}
        placeholder={escolhido ? escolhido.nome : 'Digite para buscar o material…'}
        onFocus={abrir}
        onClick={() => { if (!aberto) abrir() }}
        onChange={e => { setTexto(e.target.value); setAtivo(rotuloVazio && e.target.value ? 1 : 0); if (!aberto) setAberto(true) }}
        onKeyDown={teclas}
        onBlur={() => setTimeout(() => { setAberto(false); setTexto('') }, 150)}
        className={`${classeInput} ${compacto ? 'h-8' : ''} pl-8 pr-14 ${!aberto && escolhido ? 'font-medium text-slate-900' : ''}`}
        autoComplete="off"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs text-slate-500">
        {!aberto && escolhido && <span className="tabular-nums">{quantidade(escolhido)}</span>}
        <ChevronDown size={14} className="text-slate-400" />
      </span>

      {aberto && posicao && (
        <ul
          ref={lista}
          id={id}
          role="listbox"
          style={{ position: 'fixed', left: posicao.left, width: posicao.width, ...(posicao.acima ? { bottom: window.innerHeight - posicao.top + 4 } : { top: posicao.top + 4 }) }}
          className="z-[60] max-h-72 overflow-auto rounded-lg border border-slate-200 bg-superficie py-1 text-sm shadow-lg"
          onMouseDown={e => e.preventDefault()}
        >
          {opcoes.map((o, i) => (
            <li key={o.id || 'vazio'} data-indice={i} role="option" aria-selected={o.id === valor}
              onMouseEnter={() => setAtivo(i)} onClick={() => escolher(o.id)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 ${i === ativo ? 'bg-blue-50' : ''} ${o.id === valor ? 'font-semibold' : ''}`}>
              {o.produto ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-slate-900">
                    {o.produto.nome}
                    {o.produto.codigo && <span className="ml-2 font-mono text-xs text-slate-400">{o.produto.codigo}</span>}
                  </span>
                  <span className={`shrink-0 tabular-nums text-xs ${(mostrarDisponivel ? o.produto.quantidade_disponivel : o.produto.quantidade_atual) > 0 ? 'text-slate-500' : 'text-red-600'}`}>
                    {mostrarDisponivel ? 'disp. ' : ''}{quantidade(o.produto)}
                  </span>
                </>
              ) : <span className="text-blue-700">{rotuloVazio}</span>}
            </li>
          ))}
          {!resultados.length && <li className="px-3 py-2 text-slate-500">Nenhum material encontrado para “{texto}”.</li>}
          {resultados.length === LIMITE && <li className="px-3 py-1.5 text-xs text-slate-400">Mostrando os primeiros {LIMITE}. Digite mais para filtrar.</li>}
        </ul>
      )}
    </div>
  )
}
