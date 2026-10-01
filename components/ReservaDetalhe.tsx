'use client'
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FileText, PackageCheck, Pencil, XCircle } from 'lucide-react'
import { api, formatarData, formatarQtd, mensagemErro } from '@/lib/cliente'
import type { ReservaDetalhe as Detalhe } from '@/lib/tipos'
import { AvisoErro, Botao, Modal, Tabela, celula, celulaNumero } from './ui'
import { StatusReserva } from './Telas'

export function ReservaDetalhe({ reservaId, versao, aoFechar, aoEditar, aoRetirar, aoAguardar, aoCancelar, abrirComprovante }: {
  reservaId: number
  /** Muda quando a reserva é alterada por fora, para recarregar. */
  versao: number
  aoFechar: () => void
  aoEditar: (r: Detalhe) => void
  aoRetirar: (r: Detalhe) => void
  aoAguardar: (r: Detalhe) => void
  aoCancelar: (r: Detalhe) => void
  abrirComprovante: (requisicaoId: number) => void
}) {
  const [reserva, setReserva] = useState<Detalhe | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try {
      setReserva(await api<Detalhe>(`/api/reservas/${reservaId}`))
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [reservaId])
  useEffect(() => { carregar() }, [carregar, versao])

  const aberta = reserva && (reserva.status === 'SEPARADO' || reserva.status === 'AGUARDANDO_RETIRADA')

  return (
    <Modal titulo={reserva ? `Reserva ${reserva.numero}` : 'Reserva'} descricao={reserva?.finalidade} aoFechar={aoFechar} largura="max-w-2xl">
      {!reserva ? <p className="py-6 text-center text-sm text-slate-500">{erro || 'Carregando…'}</p> : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Info rotulo="Status" valor={<StatusReserva status={reserva.status} />} />
            <Info rotulo="Criada em" valor={formatarData(reserva.criado_em)} />
            <Info rotulo="Responsável" valor={reserva.reservado_por || '—'} />
            <Info rotulo="Itens" valor={String(reserva.itens.length)} />
          </dl>
          {reserva.observacao && <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{reserva.observacao}</p>}

          <div className="rounded-md border border-slate-200">
            <Tabela colunas={[{ titulo: '#', largura: 'w-10' }, { titulo: 'Material' }, { titulo: 'Quantidade', alinhar: 'direita' }, { titulo: 'Un.' }]}>
              {reserva.itens.map((i, n) => (
                <tr key={i.id}>
                  <td className={`${celula} text-slate-500`}>{n + 1}</td>
                  <td className={celula}>{i.produto_nome}</td>
                  <td className={celulaNumero}>{formatarQtd(i.quantidade)}</td>
                  <td className={`${celula} text-slate-500`}>{i.unidade}</td>
                </tr>
              ))}
            </Tabela>
          </div>

          <AvisoErro texto={erro} />

          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            {aberta && (
              <>
                <Botao onClick={() => aoEditar(reserva)} icone={<Pencil size={16} />}>Editar</Botao>
                {reserva.status === 'SEPARADO' && <Botao onClick={() => aoAguardar(reserva)} icone={<CheckCircle2 size={16} />}>Marcar pronto</Botao>}
                <span className="flex-1" />
                <Botao variante="perigo" onClick={() => aoCancelar(reserva)} icone={<XCircle size={16} />}>Cancelar reserva</Botao>
                <Botao variante="primario" onClick={() => aoRetirar(reserva)} icone={<PackageCheck size={16} />}>Retirar</Botao>
              </>
            )}
            {!aberta && reserva.requisicao_id && (
              <Botao onClick={() => abrirComprovante(reserva.requisicao_id!)} icone={<FileText size={16} />}>Ver comprovante da retirada</Botao>
            )}
            {!aberta && !reserva.requisicao_id && <p className="text-sm text-slate-500">Reserva encerrada.</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{valor}</dd>
    </div>
  )
}
