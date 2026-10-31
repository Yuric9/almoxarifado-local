'use client'
import { useId, useMemo, useState } from 'react'
import { UserRound } from 'lucide-react'
import type { Funcionario } from '@/lib/tipos'
import { classeInput } from './ui'

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

export type Pessoa = { funcionario_id: number | null; nome: string }

/**
 * Quem está retirando: busca o funcionário cadastrado (nome ou matrícula).
 * Se a pessoa não estiver cadastrada, o nome digitado é usado assim mesmo,
 * para não travar o atendimento; o ideal é cadastrar em "Pessoas e setores".
 */
export function SeletorFuncionario({ funcionarios, valor, aoMudar, autoFocus }: {
  funcionarios: Funcionario[]
  valor: Pessoa
  aoMudar: (p: Pessoa) => void
  autoFocus?: boolean
}) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const ativos = funcionarios.filter(f => f.ativo)

  const resultados = useMemo(() => {
    const palavras = semAcento(valor.nome).split(/\s+/).filter(Boolean)
    return ativos.filter(f => palavras.every(w => semAcento(`${f.nome} ${f.matricula ?? ''}`).includes(w))).slice(0, 30)
  }, [ativos, valor.nome])

  const escolher = (f: Funcionario) => { aoMudar({ funcionario_id: f.id, nome: f.nome }); setAberto(false) }
  const cadastrado = valor.funcionario_id ? ativos.find(f => f.id === valor.funcionario_id) : undefined

  return (
    <div className="relative">
      <UserRound size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        role="combobox" aria-label="Retirado por" aria-expanded={aberto} aria-controls={id} aria-autocomplete="list" autoComplete="off"
        autoFocus={autoFocus} required value={valor.nome}
        placeholder={ativos.length ? 'Digite o nome ou a matrícula' : 'Nome de quem retira'}
        onChange={e => { aoMudar({ funcionario_id: null, nome: e.target.value }); setAberto(true); setAtivo(0) }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={e => {
          if (!aberto || !resultados.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(a => Math.min(a + 1, resultados.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[ativo]) }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAberto(false) }
        }}
        className={`${classeInput} pl-8`}
      />
      <p className="mt-0.5 text-xs">
        {cadastrado
          ? <span className="text-emerald-700">Funcionário cadastrado{cadastrado.setor ? ` · ${cadastrado.setor}` : ''}</span>
          : valor.nome.trim() ? <span className="text-amber-700">Não cadastrado: vai como nome digitado</span> : null}
      </p>
      {aberto && resultados.length > 0 && !cadastrado && (
        <ul id={id} role="listbox" onMouseDown={e => e.preventDefault()}
          className="absolute left-0 right-0 top-10 z-[60] max-h-60 overflow-auto rounded-lg border border-slate-200 bg-superficie py-1 text-sm shadow-lg">
          {resultados.map((f, i) => (
            <li key={f.id} role="option" aria-selected={i === ativo} onMouseEnter={() => setAtivo(i)} onClick={() => escolher(f)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 ${i === ativo ? 'bg-blue-50' : ''}`}>
              <span className="min-w-0 flex-1 truncate text-slate-900">{f.nome}{f.matricula && <span className="ml-2 font-mono text-xs text-slate-400">{f.matricula}</span>}</span>
              <span className="shrink-0 text-xs text-slate-500">{[f.funcao, f.setor].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
