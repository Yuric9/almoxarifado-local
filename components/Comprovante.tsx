'use client'
import { useId, useState } from 'react'
import { Printer, Undo2, X } from 'lucide-react'
import { api, formatarData, formatarQtd } from '@/lib/cliente'
import type { RequisicaoDetalhe } from '@/lib/tipos'
import { AvisoErro, Botao, Campo, ModalFormulario, classeInput, useEnvio, useFecharComEsc } from './ui'

export function Comprovante({ requisicao, empresa, setor, aoFechar, aoEstornar }: {
  requisicao: RequisicaoDetalhe
  empresa?: string
  setor?: string
  aoFechar: () => void
  aoEstornar: (mensagem: string) => Promise<void>
}) {
  const id = useId()
  const [estornando, setEstornando] = useState(false)
  useFecharComEsc(id, aoFechar)

  const total = requisicao.itens.length
  const cancelada = requisicao.status === 'CANCELADA'

  return (
    <div data-dialogo={id} className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/50 p-4">
      <div className="mb-3 flex w-full max-w-[210mm] justify-end gap-2 print:hidden">
        {!cancelada && <Botao variante="perigo" onClick={() => setEstornando(true)} icone={<Undo2 size={16} />}>Estornar retirada</Botao>}
        <span className="flex-1" />
        <Botao onClick={aoFechar} icone={<X size={16} />}>Fechar</Botao>
        <Botao variante="primario" onClick={() => window.print()} icone={<Printer size={16} />}>Imprimir</Botao>
      </div>

      <article className="print-document relative w-full max-w-[210mm] bg-superficie px-10 py-9 text-sm text-slate-900 shadow-xl">
        {cancelada && (
          <div className="mb-4 rounded border-2 border-red-300 px-3 py-2 text-center text-red-700">
            <p className="font-bold uppercase tracking-widest">Retirada estornada</p>
            {requisicao.motivo_cancelamento && <p className="text-xs">Motivo: {requisicao.motivo_cancelamento}{requisicao.cancelada_em ? ` · ${formatarData(requisicao.cancelada_em)}` : ''}</p>}
          </div>
        )}
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{[empresa, setor || 'Almoxarifado'].filter(Boolean).join(' · ')}</p>
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

      {estornando && (
        <EstornoModal requisicao={requisicao} aoFechar={() => setEstornando(false)} aoConcluir={async msg => { setEstornando(false); await aoEstornar(msg) }} />
      )}
    </div>
  )
}

function EstornoModal({ requisicao, aoFechar, aoConcluir }: { requisicao: RequisicaoDetalhe; aoFechar: () => void; aoConcluir: (msg: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('')
  const { enviando, erro, executar } = useEnvio()
  return (
    <ModalFormulario
      titulo={`Estornar ${requisicao.numero}`}
      descricao="Os materiais voltam para o estoque e a retirada fica marcada como estornada. Use para corrigir lançamentos errados."
      aoFechar={aoFechar}
      rotuloEnviar="Confirmar estorno"
      enviando={enviando}
      aoEnviar={e => {
        e.preventDefault()
        executar(async () => {
          await api(`/api/requisicoes/${requisicao.id}/estorno`, { method: 'POST', json: { motivo } })
          await aoConcluir(`Retirada ${requisicao.numero} estornada`)
        })
      }}
    >
      <Campo rotulo="Motivo do estorno">
        <input autoFocus required value={motivo} onChange={e => setMotivo(e.target.value)} className={classeInput} placeholder="Ex.: lançada em duplicidade" />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
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
