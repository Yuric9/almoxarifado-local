'use client'
import { useEffect } from 'react'
import { formatarData, formatarQtd } from '@/lib/cliente'
import type { RequisicaoDetalhe } from '@/lib/tipos'

export function Comprovante({ requisicao, aoFechar }: { requisicao: RequisicaoDetalhe; aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  return (
    <div className="print-overlay fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/40 p-4">
      <div className="print-document w-full max-w-2xl rounded-[20px] bg-white p-8">
        <div className="mb-5 border-b pb-4 text-center">
          <h2 className="text-2xl font-black">ALMOXARIFADO LOCAL</h2>
          <p className="text-lg font-bold">COMPROVANTE DE RETIRADA</p>
          <p className="text-zinc-500">{requisicao.numero}{requisicao.reserva_numero ? ` · Reserva ${requisicao.reserva_numero}` : ''}</p>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
          <p><b>Retirado por:</b> {requisicao.retirado_por}</p>
          <p><b>Setor:</b> {requisicao.setor || '—'}</p>
          <p><b>Data:</b> {formatarData(requisicao.criado_em)}</p>
          <p><b>Entregue por:</b> {requisicao.entregue_por || '—'}</p>
        </div>
        <table className="mb-5 w-full border-collapse">
          <thead><tr className="border-b-2 text-left"><th className="py-2">Material</th><th className="py-2 text-right">Qtd.</th><th className="py-2 pl-4">Un.</th></tr></thead>
          <tbody>
            {requisicao.itens.map(i => (
              <tr key={i.id} className="border-b"><td className="py-2">{i.produto_nome}</td><td className="py-2 text-right">{formatarQtd(i.quantidade)}</td><td className="py-2 pl-4">{i.unidade}</td></tr>
            ))}
          </tbody>
        </table>
        {requisicao.finalidade && <p className="mb-3"><b>Finalidade:</b> {requisicao.finalidade}</p>}
        {requisicao.observacao && <p className="mb-6"><b>Observação:</b> {requisicao.observacao}</p>}
        <div className="mt-14 grid grid-cols-2 gap-10 text-center text-sm">
          <div className="border-t pt-2">Assinatura de quem retirou</div>
          <div className="border-t pt-2">Assinatura do responsável</div>
        </div>
        <div className="mt-8 flex gap-3 print:hidden">
          <button onClick={aoFechar} className="h-12 flex-1 rounded-xl border-2 font-bold">Fechar</button>
          <button onClick={() => window.print()} className="h-12 flex-1 rounded-xl bg-zinc-900 font-bold text-white">🖨️ Imprimir</button>
        </div>
      </div>
    </div>
  )
}
