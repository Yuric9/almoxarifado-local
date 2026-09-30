'use client'
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
    <div>
      <div className="space-y-3">
        {linhas.map((linha, i) => {
          const p = produtos.find(x => String(x.id) === linha.produto_id)
          const excede = p && Number(linha.quantidade) > p.quantidade_disponivel
          return (
            <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2">
              <select aria-label="Material" value={linha.produto_id} onChange={e => atualizar(i, 'produto_id', e.target.value)} className={classeInput}>
                <option value="">Selecione o material</option>
                {produtos.map(p => (
                  <option key={p.id} value={p.id}>{p.nome} — disponível: {formatarQtd(p.quantidade_disponivel)} {p.unidade}</option>
                ))}
              </select>
              <input aria-label="Quantidade" type="number" min="0" step="any" inputMode="decimal" placeholder="Qtd." value={linha.quantidade} onChange={e => atualizar(i, 'quantidade', e.target.value)} className={classeInput} />
              <button type="button" onClick={() => aoMudar(linhas.filter((_, idx) => idx !== i))} disabled={linhas.length === 1} className="rounded-xl border px-3 font-semibold text-red-600 disabled:opacity-30">Remover</button>
              {excede && (
                <p className="col-span-3 text-sm font-semibold text-red-600">
                  ⚠️ Só {formatarQtd(p.quantidade_disponivel)} {p.unidade} {avisoDisponivel}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" onClick={() => aoMudar([...linhas, linhaVazia()])} className="mt-3 font-bold text-blue-600">+ Adicionar outro material</button>
    </div>
  )
}
