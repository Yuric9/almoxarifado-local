'use client'
import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, Printer } from 'lucide-react'
import { api, formatarData, formatarQtd, lerData, mensagemErro } from '@/lib/cliente'
import { descreverOrigem, type Relatorio } from '@/lib/tipos'
import { Badge, Botao, CabecalhoPagina, Painel, Tabela, celula, celulaNumero, classeCampo } from './ui'

type Modo = 'mes' | 'dia' | 'periodo'

const p2 = (n: number) => String(n).padStart(2, '0')
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
const mesAtual = () => hoje().slice(0, 7)

function limitesDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${p2(ultimo)}` }
}

function formatarDia(dia: string, comSemana = false) {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', comSemana ? { weekday: 'short', day: '2-digit', month: '2-digit' } : undefined)
}

export function TelaRelatorios({ empresa }: { empresa?: string }) {
  const [modo, setModo] = useState<Modo>('mes')
  const [mes, setMes] = useState(mesAtual())
  const [dia, setDia] = useState(hoje())
  const [inicio, setInicio] = useState(`${mesAtual()}-01`)
  const [fim, setFim] = useState(hoje())
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const periodo = modo === 'mes' ? limitesDoMes(mes) : modo === 'dia' ? { inicio: dia, fim: dia } : { inicio, fim }
  const consulta = `inicio=${periodo.inicio}&fim=${periodo.fim}`

  useEffect(() => {
    if (!periodo.inicio || !periodo.fim) return
    setCarregando(true)
    api<Relatorio>(`/api/relatorios?${consulta}`)
      .then(r => { setRelatorio(r); setErro('') })
      .catch(e => { setRelatorio(null); setErro(mensagemErro(e)) })
      .finally(() => setCarregando(false))
  }, [consulta, periodo.inicio, periodo.fim])

  const titulo = modo === 'mes'
    ? new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : modo === 'dia' ? formatarDia(dia) : `${formatarDia(inicio)} a ${formatarDia(fim)}`

  return (
    <>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Movimentação do estoque por dia, mês ou período"
        acoes={<>
          <a href={`/api/relatorios?${consulta}&formato=csv`} download className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-superficie px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download size={16} /> CSV</a>
          <a href={`/api/relatorios?${consulta}&formato=xlsx`} download className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-superficie px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={16} /> Excel</a>
          <Botao variante="primario" onClick={() => window.print()} disabled={!relatorio} icone={<Printer size={16} />}>Imprimir</Botao>
        </>}
      />

      <Painel>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex rounded-md border border-slate-300 p-0.5" role="tablist" aria-label="Tipo de período">
            {([['mes', 'Mensal'], ['dia', 'Diário'], ['periodo', 'Período']] as const).map(([valor, rotulo]) => (
              <button key={valor} role="tab" aria-selected={modo === valor} onClick={() => setModo(valor)}
                className={`rounded px-3 py-1 font-medium ${modo === valor ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{rotulo}</button>
            ))}
          </div>
          {modo === 'mes' && <input type="month" aria-label="Mês" value={mes} onChange={e => setMes(e.target.value)} className={classeCampo} />}
          {modo === 'dia' && <input type="date" aria-label="Dia" value={dia} onChange={e => setDia(e.target.value)} className={classeCampo} />}
          {modo === 'periodo' && (
            <>
              <input type="date" aria-label="Data inicial" value={inicio} onChange={e => setInicio(e.target.value)} className={classeCampo} />
              <span className="text-slate-500">até</span>
              <input type="date" aria-label="Data final" value={fim} onChange={e => setFim(e.target.value)} className={classeCampo} />
            </>
          )}
          {carregando && <span className="text-slate-500">Carregando…</span>}
        </div>
      </Painel>

      {erro && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}

      {relatorio && (
        <div className="print-document mt-5 space-y-5 bg-fundo">
          <header className="hidden border-b-2 border-slate-900 pb-3 print:block">
            <p className="text-xs uppercase tracking-widest text-slate-500">{[empresa, 'Almoxarifado'].filter(Boolean).join(' · ')}</p>
            <h2 className="text-lg font-bold">Relatório de movimentação · {titulo}</h2>
            <p className="text-xs text-slate-500">Emitido em {new Date().toLocaleString('pt-BR')}</p>
          </header>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi rotulo="Movimentações" valor={relatorio.resumo.movimentacoes} />
            <Kpi rotulo="Entradas" valor={relatorio.resumo.entradas} />
            <Kpi rotulo="Retiradas" valor={relatorio.resumo.retiradas} />
            <Kpi rotulo="Baixas" valor={relatorio.resumo.baixas} alerta />
            <Kpi rotulo="Materiais movimentados" valor={relatorio.resumo.materiais_movimentados} />
          </div>

          {relatorio.dias.length > 1 && (
            <Painel titulo="Movimentação por dia" semPadding>
              <Tabela colunas={[{ titulo: 'Dia' }, { titulo: 'Entradas', alinhar: 'direita' }, { titulo: 'Saídas', alinhar: 'direita' }, { titulo: 'Baixas', alinhar: 'direita' }, { titulo: 'Retiradas', alinhar: 'direita' }]}>
                {relatorio.dias.map(d => {
                  const vazio = !d.entradas && !d.saidas && !d.baixas
                  return (
                    <tr key={d.dia} className={vazio ? 'text-slate-400' : ''}>
                      <td className={`${celula} whitespace-nowrap capitalize`}>{formatarDia(d.dia, true)}</td>
                      <td className={celulaNumero}>{d.entradas || '—'}</td>
                      <td className={celulaNumero}>{d.saidas || '—'}</td>
                      <td className={celulaNumero}>{d.baixas || '—'}</td>
                      <td className={celulaNumero}>{d.retiradas || '—'}</td>
                    </tr>
                  )
                })}
              </Tabela>
            </Painel>
          )}

          <Painel titulo="Resumo por material" semPadding>
            <Tabela
              colunas={[{ titulo: 'Material' }, { titulo: 'Un.' }, { titulo: 'Saldo inicial', alinhar: 'direita' }, { titulo: 'Entradas', alinhar: 'direita' }, { titulo: 'Saídas', alinhar: 'direita' }, { titulo: 'Baixas', alinhar: 'direita' }, { titulo: 'Ajustes', alinhar: 'direita' }, { titulo: 'Saldo final', alinhar: 'direita' }]}
              vazio="Nenhum material com estoque ou movimentação no período."
            >
              {relatorio.materiais.map(l => (
                <tr key={l.produto_id}>
                  <td className={`${celula} font-medium`}>{l.nome}</td>
                  <td className={`${celula} text-slate-500`}>{l.unidade}</td>
                  <td className={celulaNumero}>{formatarQtd(l.saldo_inicial)}</td>
                  <td className={`${celulaNumero} text-emerald-700`}>{l.entradas ? `+${formatarQtd(l.entradas)}` : '—'}</td>
                  <td className={celulaNumero}>{l.saidas ? `−${formatarQtd(l.saidas)}` : '—'}</td>
                  <td className={`${celulaNumero} text-red-700`}>{l.baixas ? `−${formatarQtd(l.baixas)}` : '—'}</td>
                  <td className={celulaNumero}>{l.ajustes ? `${l.ajustes > 0 ? '+' : '−'}${formatarQtd(Math.abs(l.ajustes))}` : '—'}</td>
                  <td className={`${celulaNumero} font-semibold`}>{formatarQtd(l.saldo_final)}</td>
                </tr>
              ))}
            </Tabela>
          </Painel>

          {relatorio.requisicoes.length > 0 && (
            <Painel titulo={`Retiradas (${relatorio.requisicoes.length})`} semPadding>
              <Tabela colunas={[{ titulo: 'Número' }, { titulo: 'Data' }, { titulo: 'Retirado por' }, { titulo: 'Setor' }, { titulo: 'Finalidade' }, { titulo: 'Itens', alinhar: 'direita' }, { titulo: 'Situação' }]}>
                {relatorio.requisicoes.map(r => (
                  <tr key={r.id}>
                    <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{r.numero}</td>
                    <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(r.criado_em)}</td>
                    <td className={celula}>{r.retirado_por}</td>
                    <td className={`${celula} text-slate-600`}>{r.setor || '—'}</td>
                    <td className={`${celula} text-slate-600`}>{r.finalidade || '—'}</td>
                    <td className={celulaNumero}>{r.total_itens}</td>
                    <td className={celula}>{r.status === 'CANCELADA' ? <Badge tom="vermelho">Estornada</Badge> : <Badge tom="verde">Finalizada</Badge>}</td>
                  </tr>
                ))}
              </Tabela>
            </Painel>
          )}

          <Painel titulo={`Todas as movimentações (${relatorio.movimentacoes.length})`} semPadding>
            <Tabela colunas={[{ titulo: 'Data' }, { titulo: 'Movimento' }, { titulo: 'Material' }, { titulo: 'Quantidade', alinhar: 'direita' }, { titulo: 'Responsável' }, { titulo: 'Observação' }]} vazio="Nenhuma movimentação no período.">
              {relatorio.movimentacoes.map(m => (
                <tr key={m.id}>
                  <td className={`${celula} whitespace-nowrap text-slate-600`}>{lerData(m.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className={`${celula} whitespace-nowrap`}>{descreverOrigem(m)}</td>
                  <td className={celula}>{m.produto_nome}</td>
                  <td className={`${celulaNumero} whitespace-nowrap`}>{m.tipo === 'SAIDA' ? '−' : '+'}{formatarQtd(m.quantidade)} {m.unidade}</td>
                  <td className={`${celula} text-slate-600`}>{m.responsavel || '—'}</td>
                  <td className={`${celula} text-slate-500`}>{m.observacao || '—'}</td>
                </tr>
              ))}
            </Tabela>
          </Painel>
        </div>
      )}
    </>
  )
}

function Kpi({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-superficie px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alerta && valor > 0 ? 'text-red-700' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}
