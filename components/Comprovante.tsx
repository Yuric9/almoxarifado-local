'use client'
import { useEffect } from 'react'
import { Printer, X } from 'lucide-react'
import { formatarData, formatarQtd } from '@/lib/cliente'
import type { RequisicaoDetalhe } from '@/lib/tipos'
import { Botao } from './ui'

export function Comprovante({ requisicao, aoFechar }: { requisicao: RequisicaoDetalhe; aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  const total = requisicao.itens.length

  return (
    <div className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-slate-900/40 p-4">
      <div className="mb-3 flex w-full max-w-[210mm] justify-end gap-2 print:hidden">
        <Botao onClick={aoFechar} icone={<X size={16} />}>Fechar</Botao>
        <Botao variante="primario" onClick={() => window.print()} icone={<Printer size={16} />}>Imprimir</Botao>
      </div>

      <article className="print-document w-full max-w-[210mm] bg-white px-10 py-9 text-sm text-slate-900 shadow-xl">
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Almoxarifado Local</p>
            <h2 className="mt-1 text-lg font-bold">Comprovante de Retirada de Material</h2>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Nº</p>
            <p className="font-mono text-base font-semibold">{requisicao.numero}</p>
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
          <Info rotulo="Data / hora" valor={formatarData(requisicao.criado_em)} />
          <Info rotulo="Reserva de origem" valor={requisicao.reserva_numero || '—'} />
          <Info rotulo="Retirado por" valor={requisicao.retirado_por} />
          <Info rotulo="Setor" valor={requisicao.setor || '—'} />
          <Info rotulo="Entregue por" valor={requisicao.entregue_por || '—'} />
          <Info rotulo="Finalidade" valor={requisicao.finalidade || '—'} />
        </dl>

        <table className="mt-6 w-full border border-slate-300">
          <thead>
            <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="w-10 border-b border-slate-300 px-3 py-2">#</th>
              <th className="border-b border-slate-300 px-3 py-2">Material</th>
              <th className="w-28 border-b border-slate-300 px-3 py-2 text-right">Quantidade</th>
              <th className="w-16 border-b border-slate-300 px-3 py-2">Un.</th>
            </tr>
          </thead>
          <tbody>
            {requisicao.itens.map((i, n) => (
              <tr key={i.id} className="border-b border-slate-200 last:border-0">
                <td className="px-3 py-2 text-slate-500">{n + 1}</td>
                <td className="px-3 py-2">{i.produto_nome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarQtd(i.quantidade)}</td>
                <td className="px-3 py-2">{i.unidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-right text-xs text-slate-500">{total} {total === 1 ? 'item' : 'itens'}</p>

        {requisicao.observacao && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Observação</p>
            <p className="mt-1">{requisicao.observacao}</p>
          </div>
        )}

        <div className="mt-16 grid grid-cols-2 gap-12 text-center text-xs text-slate-600">
          <div className="border-t border-slate-400 pt-2">{requisicao.retirado_por}<br />Recebedor</div>
          <div className="border-t border-slate-400 pt-2">{requisicao.entregue_por || ' '}<br />Responsável pela entrega</div>
        </div>
      </article>
    </div>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className="mt-0.5 font-medium">{valor}</dd>
    </div>
  )
}
