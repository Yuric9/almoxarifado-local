'use client'
import { Plus, Trash2 } from 'lucide-react'
import type { Produto } from '@/lib/tipos'
import { formatarQtd } from '@/lib/cliente'
import { classeInput } from './ui'

export type LinhaItem = { produto_id: string; quantidade: string }

export const linhaVazia = (): LinhaItem => ({ produto_id: '', quantidade: '' })

/** Converte as linhas do formulário no formato esperado pela API. */
export function itensPreenchidos(linhas: LinhaItem[]) {
  return linhas
    .filter(l => l.produto_id && Number(l.quantidade) > 0)
    .map(l => ({ produto_id: Number(l.produto_id), quantidade: Number(l.quantidade) }))
}

export function ItensMateriais({ produtos, linhas, aoMudar, avisoDisponivel }: {
  produtos: Produto[]
  linhas: LinhaItem[]
  aoMudar: (linhas: LinhaItem[]) => void
  avisoDisponivel: string
}) {
  const atualizar = (i: number, campo: keyof LinhaItem, valor: string) =>
    aoMudar(linhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))

  return (
    <div className="rounded-md border border-slate-200">
      <div className="grid grid-cols-[1fr_120px_36px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Material</span><span className="text-right">Quantidade</span><span />
      </div>
      <div className="divide-y divide-slate-100">
        {linhas.map((linha, i) => {
          const p = produtos.find(x => String(x.id) === linha.produto_id)
          const excede = p && Number(linha.quantidade) > p.quantidade_disponivel
          return (
            <div key={i} className="px-3 py-2">
              <div className="grid grid-cols-[1fr_120px_36px] items-center gap-2">
                <select aria-label="Material" value={linha.produto_id} onChange={e => atualizar(i, 'produto_id', e.target.value)} className={classeInput}>
                  <option value="">Selecione…</option>
                  {produtos.map(p => (
                    <option key={p.id} value={p.id}>{p.nome} (disp. {formatarQtd(p.quantidade_disponivel)} {p.unidade})</option>
                  ))}
                </select>
                <input aria-label="Quantidade" type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={linha.quantidade} onChange={e => atualizar(i, 'quantidade', e.target.value)} className={`${classeInput} text-right`} />
                <button type="button" aria-label="Remover item" title="Remover item" onClick={() => aoMudar(linhas.filter((_, idx) => idx !== i))} disabled={linhas.length === 1} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30 disabled:hover:bg-transparent">
                  <Trash2 size={16} />
                </button>
              </div>
              {excede && (
                <p className="mt-1 text-xs text-red-700">Disponível: {formatarQtd(p.quantidade_disponivel)} {p.unidade}. {avisoDisponivel}</p>
              )}
            </div>
          )
        })}
      </div>
      <div className="border-t border-slate-200 px-3 py-2">
        <button type="button" onClick={() => aoMudar([...linhas, linhaVazia()])} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800">
          <Plus size={16} /> Adicionar item
        </button>
      </div>
    </div>
  )
}
