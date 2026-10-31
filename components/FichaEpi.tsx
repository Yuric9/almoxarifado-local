'use client'
import { useEffect, useId, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { api, formatarQtd, lerData, mensagemErro } from '@/lib/cliente'
import { dataBr, type EpiEmUso, type FichaEpi } from '@/lib/tipos'
import { Badge, Botao, useFecharComEsc } from './ui'

const SITUACAO: Record<EpiEmUso['situacao'], { texto: string; tom: 'verde' | 'amarelo' | 'vermelho' | 'neutro' }> = {
  VENCIDA: { texto: 'Troca vencida', tom: 'vermelho' },
  VENCE_EM_BREVE: { texto: 'Trocar em breve', tom: 'amarelo' },
  EM_DIA: { texto: 'Em dia', tom: 'verde' },
  SEM_PRAZO: { texto: 'Sem prazo de troca', tom: 'neutro' }
}

const dia = (utc: string) => lerData(utc).toLocaleDateString('pt-BR')

/** Ficha de controle de entrega de EPI (NR-6), pronta para imprimir e colher assinatura. */
export function FichaEpiModal({ funcionarioId, empresa, aoFechar }: { funcionarioId: number; empresa?: string; aoFechar: () => void }) {
  const id = useId()
  useFecharComEsc(id, aoFechar)
  const [ficha, setFicha] = useState<FichaEpi | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api<FichaEpi>(`/api/funcionarios/${funcionarioId}/epi`).then(setFicha).catch(e => setErro(mensagemErro(e)))
  }, [funcionarioId])

  const f = ficha?.funcionario
  return (
    <div data-dialogo={id} role="dialog" aria-label="Ficha de EPI" className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/50 p-4">
      <div className="mb-3 flex w-full max-w-[210mm] justify-end gap-2 print:hidden">
        <Botao onClick={aoFechar} icone={<X size={16} />}>Fechar</Botao>
        <Botao variante="primario" onClick={() => window.print()} disabled={!ficha} icone={<Printer size={16} />}>Imprimir</Botao>
      </div>

      <article className="print-document w-full max-w-[210mm] bg-superficie px-10 py-9 text-sm text-slate-900 shadow-xl">
        {erro && <p className="text-red-700">{erro}</p>}
        {!ficha && !erro && <p className="py-10 text-center text-slate-500">Carregando…</p>}
        {ficha && f && (
          <>
            <header className="border-b-2 border-slate-900 pb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{[empresa, 'Almoxarifado'].filter(Boolean).join(' · ')}</p>
              <h2 className="mt-1 text-lg font-bold">Ficha de Controle de Entrega de EPI</h2>
              <p className="text-xs text-slate-500">Equipamento de Proteção Individual · NR-6</p>
            </header>

            <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
              <Info rotulo="Funcionário" valor={f.nome} />
              <Info rotulo="Matrícula" valor={f.matricula || '—'} />
              <Info rotulo="Função" valor={f.funcao || '—'} />
              <Info rotulo="Setor / obra" valor={f.setor || '—'} />
            </dl>

            {ficha.em_uso.length > 0 && (
              <section className="mt-6 print:hidden">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Situação dos EPIs</h3>
                <table className="w-full border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                      <th className="border-b border-slate-300 px-3 py-2">EPI</th>
                      <th className="border-b border-slate-300 px-3 py-2">Última entrega</th>
                      <th className="border-b border-slate-300 px-3 py-2">Próxima troca</th>
                      <th className="border-b border-slate-300 px-3 py-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ficha.em_uso.map(e => (
                      <tr key={e.produto_id} className="border-b border-slate-200 last:border-0">
                        <td className="px-3 py-2">{e.nome}</td>
                        <td className="px-3 py-2 tabular-nums">{dia(e.ultima_entrega)}</td>
                        <td className="px-3 py-2 tabular-nums">{e.proxima_troca ? dataBr(e.proxima_troca) : '—'}</td>
                        <td className="px-3 py-2"><Badge tom={SITUACAO[e.situacao].tom}>{SITUACAO[e.situacao].texto}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Entregas</h3>
            <table className="w-full border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <th className="w-24 border-b border-slate-300 px-3 py-2">Data</th>
                  <th className="border-b border-slate-300 px-3 py-2">EPI</th>
                  <th className="w-20 border-b border-slate-300 px-3 py-2 text-right">Qtd.</th>
                  <th className="w-20 border-b border-slate-300 px-3 py-2">CA</th>
                  <th className="w-36 border-b border-slate-300 px-3 py-2">Retirada</th>
                  <th className="w-32 border-b border-slate-300 px-3 py-2">Assinatura</th>
                </tr>
              </thead>
              <tbody>
                {ficha.entregas.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nenhum EPI entregue a este funcionário.</td></tr>
                )}
                {ficha.entregas.map((e, n) => (
                  <tr key={`${e.requisicao_id}-${e.produto_id}-${n}`} className="border-b border-slate-200 last:border-0">
                    <td className="px-3 py-2 tabular-nums">{dia(e.data)}</td>
                    <td className="px-3 py-2">{e.nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarQtd(e.quantidade)} {e.unidade}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.ca || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{e.numero}</td>
                    <td className="px-3 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-6 text-justify text-xs leading-relaxed text-slate-700">
              Declaro que recebi gratuitamente os Equipamentos de Proteção Individual relacionados acima, que fui orientado(a) sobre
              o uso correto, a guarda e a conservação, e que estou ciente da obrigação de usá-los apenas para a finalidade a que se
              destinam, de comunicar qualquer alteração que os torne impróprios para uso e de devolvê-los quando danificados ou na
              troca, conforme a NR-6.
            </p>

            <div className="mt-14 grid grid-cols-2 gap-12 text-center text-xs text-slate-600">
              <div className="border-t border-slate-400 pt-2">{f.nome}<br />Funcionário</div>
              <div className="border-t border-slate-400 pt-2">&nbsp;<br />Responsável pelo almoxarifado</div>
            </div>
            <p className="mt-6 text-center text-[10px] text-slate-400">Emitida em {new Date().toLocaleString('pt-BR')}</p>
          </>
        )}
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
