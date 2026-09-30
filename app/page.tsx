'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ehHoje, formatarData, formatarQtd, mensagemErro } from '@/lib/cliente'
import type { Categoria, Movimentacao, Produto, RequisicaoDetalhe, RequisicaoResumo, ReservaResumo, Sistema } from '@/lib/tipos'
import { BackupModal } from '@/components/BackupModal'
import { Comprovante } from '@/components/Comprovante'
import { EntradaModal, NovoProdutoModal, RequisicaoModal, ReservaModal, RetirarReservaModal } from '@/components/Formularios'

type Janela = 'entrada' | 'novo' | 'requisicao' | 'reserva' | 'backup' | null

const ROTULO_STATUS: Record<string, string> = { SEPARADO: 'SEPARADO', AGUARDANDO_RETIRADA: 'AGUARDANDO RETIRADA' }

export default function Home() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [requisicoes, setRequisicoes] = useState<RequisicaoResumo[]>([])
  const [reservas, setReservas] = useState<ReservaResumo[]>([])
  const [sistema, setSistema] = useState<Sistema | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')

  const [busca, setBusca] = useState('')
  const [catFiltro, setCatFiltro] = useState('Todas')
  const [janela, setJanela] = useState<Janela>(null)
  const [retirando, setRetirando] = useState<ReservaResumo | null>(null)
  const [comprovante, setComprovante] = useState<RequisicaoDetalhe | null>(null)
  const [toast, setToast] = useState('')

  const notificar = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }, [])

  const recarregar = useCallback(async () => {
    try {
      const [p, m, r, s, c] = await Promise.all([
        api<Produto[]>('/api/produtos'),
        api<Movimentacao[]>('/api/movimentacoes'),
        api<RequisicaoResumo[]>('/api/requisicoes'),
        api<ReservaResumo[]>('/api/reservas'),
        api<Categoria[]>('/api/categorias')
      ])
      setProdutos(p); setMovs(m); setRequisicoes(r); setReservas(s); setCategorias(c)
      setErroCarga('')
    } catch (e) {
      setErroCarga(mensagemErro(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
    api<Sistema>('/api/sistema').then(setSistema).catch(() => {})
  }, [recarregar])

  const fechar = useCallback(() => setJanela(null), [])

  async function concluir(msg: string) {
    setJanela(null)
    await recarregar()
    notificar(msg)
  }

  async function abrirComprovante(id: number) {
    try {
      setComprovante(await api<RequisicaoDetalhe>(`/api/requisicoes/${id}`))
    } catch (e) {
      notificar('❌ ' + mensagemErro(e))
    }
  }

  async function acaoReserva(r: ReservaResumo, acao: 'aguardar' | 'liberar') {
    try {
      if (acao === 'liberar') {
        if (!window.confirm(`Liberar a reserva ${r.numero}? Os materiais voltam a ficar disponíveis.`)) return
        await api(`/api/reservas/${r.id}`, { method: 'DELETE' })
        notificar('✅ Reserva liberada')
      } else {
        await api(`/api/reservas/${r.id}`, { method: 'PATCH', json: { status: 'AGUARDANDO_RETIRADA' } })
        notificar('📦 Pedido aguardando retirada')
      }
      await recarregar()
    } catch (e) {
      notificar('❌ ' + mensagemErro(e))
    }
  }

  const alerta = useMemo(() => produtos.filter(p => p.quantidade_atual <= p.estoque_minimo), [produtos])
  const reservasAtivas = useMemo(() => reservas.filter(r => r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA'), [reservas])
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return produtos.filter(p =>
      (catFiltro === 'Todas' || p.categoria === catFiltro) &&
      p.nome.toLocaleLowerCase('pt-BR').includes(termo)
    )
  }, [produtos, busca, catFiltro])

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-4 md:p-8">
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Almoxarifado Local</h1>
          <p className="text-lg text-zinc-500">Controle de estoque simples e offline</p>
        </div>
        <div className="flex flex-1 items-center gap-2 md:max-w-lg">
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar material… ex: parafuso" aria-label="Buscar material" className="h-14 w-full rounded-2xl border-2 border-zinc-200 px-6 text-lg outline-none focus:border-blue-500" />
          <button onClick={() => setJanela('backup')} className="h-14 shrink-0 rounded-2xl border-2 border-zinc-200 bg-white px-4 font-semibold hover:bg-zinc-50" title="Backup e restauração">💾 Backup</button>
        </div>
      </header>

      {erroCarga && (
        <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          Não foi possível carregar os dados: {erroCarga} <button onClick={recarregar} className="ml-2 font-bold underline">Tentar novamente</button>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Indicador titulo="Materiais cadastrados" valor={produtos.length} />
        <Indicador titulo="Em alerta" valor={alerta.length} cor="red" />
        <Indicador titulo="Movimentações hoje" valor={movs.filter(m => ehHoje(m.criado_em)).length} cor="blue" />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <BotaoGrande cor="bg-green-600 hover:bg-green-700" onClick={() => setJanela('entrada')}>⬇️ ENTRADA RÁPIDA</BotaoGrande>
        <BotaoGrande cor="bg-blue-600 hover:bg-blue-700" onClick={() => setJanela('reserva')}>📦 SEPARAR PEDIDO</BotaoGrande>
        <BotaoGrande cor="bg-orange-600 hover:bg-orange-700" onClick={() => setJanela('requisicao')}>📝 REGISTRAR RETIRADA</BotaoGrande>
      </div>

      {reservasAtivas.length > 0 && (
        <section className="mb-8 rounded-[20px] border-2 border-blue-200 bg-blue-50 p-5">
          <h3 className="mb-3 text-lg font-bold text-blue-800">📦 Pedidos separados / reservados ({reservasAtivas.length})</h3>
          <div className="space-y-2">
            {reservasAtivas.map(r => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 py-3 last:border-0">
                <div>
                  <p className="font-bold">{r.numero} · {r.finalidade}</p>
                  <p className="text-sm text-blue-700">{r.total_itens} item(ns) · {r.reservado_por || 'Sem responsável'} · {formatarData(r.criado_em)}</p>
                  <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">{ROTULO_STATUS[r.status]}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => acaoReserva(r, 'aguardar')} disabled={r.status === 'AGUARDANDO_RETIRADA'} className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                    {r.status === 'AGUARDANDO_RETIRADA' ? 'Aguardando retirada' : 'Marcar pronto'}
                  </button>
                  <button onClick={() => setRetirando(r)} className="rounded-lg bg-orange-600 px-3 py-2 font-semibold text-white">Retirar pedido</button>
                  <button onClick={() => acaoReserva(r, 'liberar')} className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold text-red-600">Liberar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {alerta.length > 0 && (
        <section className="mb-8 rounded-[20px] border-2 border-red-200 bg-white p-5">
          <h3 className="mb-3 text-lg font-bold text-red-700">⚠️ Precisa repor</h3>
          <div className="flex flex-wrap gap-2">
            {alerta.map(a => <span key={a.id} className="rounded-full bg-red-100 px-4 py-2 font-semibold text-red-800">{a.nome} — só {formatarQtd(a.quantidade_atual)} {a.unidade}</span>)}
          </div>
        </section>
      )}

      <div className="mb-4 flex gap-2 overflow-auto pb-2">
        {['Todas', ...categorias.map(c => c.nome)].map(c => (
          <button key={c} onClick={() => setCatFiltro(c)} className={`whitespace-nowrap rounded-full border-2 px-5 py-2.5 text-base font-semibold ${catFiltro === c ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white'}`}>{c}</button>
        ))}
        <button onClick={() => setJanela('novo')} className="ml-auto whitespace-nowrap rounded-full bg-blue-600 px-5 py-2.5 font-bold text-white">+ Novo material</button>
      </div>

      {carregando && <p className="py-10 text-center text-zinc-500">Carregando…</p>}
      {!carregando && filtrados.length === 0 && (
        <p className="rounded-[20px] border-2 border-dashed py-10 text-center text-zinc-500">
          {produtos.length === 0 ? 'Nenhum material cadastrado ainda. Clique em "+ Novo material" para começar.' : 'Nenhum material encontrado.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtrados.map(p => <CartaoProduto key={p.id} produto={p} />)}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {requisicoes.length > 0 && (
          <section className="rounded-[20px] border bg-white p-5">
            <h3 className="mb-3 text-xl font-bold">Últimas retiradas</h3>
            <div className="space-y-2">
              {requisicoes.slice(0, 6).map(r => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 last:border-0">
                  <div>
                    <p className="font-bold">{r.numero} · {r.retirado_por}</p>
                    <p className="text-sm text-zinc-500">{r.setor || 'Sem setor'} · {formatarData(r.criado_em)} · {r.total_itens} item(ns)</p>
                  </div>
                  <button onClick={() => abrirComprovante(r.id)} className="rounded-lg border px-3 py-2 font-semibold hover:bg-zinc-50">Comprovante</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {movs.length > 0 && (
          <section className="rounded-[20px] border bg-white p-5">
            <h3 className="mb-4 text-xl font-bold">Histórico recente</h3>
            <div className="space-y-3">
              {movs.slice(0, 8).map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white ${m.tipo === 'ENTRADA' ? 'bg-green-600' : 'bg-orange-600'}`} aria-hidden>{m.tipo === 'ENTRADA' ? '↓' : '↑'}</div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'} · {m.produto_nome} · {formatarQtd(m.quantidade)} {m.unidade}</p>
                    <p className="truncate text-sm text-zinc-500">{[m.responsavel, m.observacao, formatarData(m.criado_em)].filter(Boolean).join(' • ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {sistema && (
        <footer className="mt-10 border-t pt-4 text-center text-xs text-zinc-400">
          Almoxarifado Local v{sistema.versao} · {sistema.modo === 'portatil' ? 'Modo portátil' : sistema.modo === 'instalado' ? 'Instalado' : 'Desenvolvimento'} · Dados em <span className="break-all">{sistema.pasta_dados}</span>
        </footer>
      )}

      {janela === 'entrada' && <EntradaModal produtos={produtos} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'novo' && <NovoProdutoModal categorias={categorias} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'reserva' && <ReservaModal produtos={produtos} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'backup' && <BackupModal aoFechar={fechar} aoRestaurar={recarregar} />}
      {janela === 'requisicao' && (
        <RequisicaoModal produtos={produtos} aoFechar={fechar} aoConcluir={async id => { await concluir('✅ Retirada registrada'); await abrirComprovante(id) }} />
      )}
      {retirando && (
        <RetirarReservaModal reserva={retirando} aoFechar={() => setRetirando(null)} aoConcluir={async id => {
          setRetirando(null)
          await recarregar()
          notificar('✅ Pedido retirado e registrado')
          await abrirComprovante(id)
        }} />
      )}
      {comprovante && <Comprovante requisicao={comprovante} aoFechar={() => setComprovante(null)} />}

      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-zinc-900 px-8 py-4 text-lg font-bold text-white shadow-2xl print:hidden">{toast}</div>}
    </div>
  )
}

function Indicador({ titulo, valor, cor }: { titulo: string; valor: number; cor?: 'red' | 'blue' }) {
  const estilos = cor === 'red' ? 'bg-red-50 border-red-200 text-red-700' : cor === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white'
  return (
    <div className={`rounded-[24px] border p-6 shadow-sm ${estilos}`}>
      <p className="text-lg opacity-80">{titulo}</p>
      <p className="text-4xl font-bold">{valor}</p>
    </div>
  )
}

function BotaoGrande({ cor, onClick, children }: { cor: string; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex h-[84px] items-center justify-center gap-3 rounded-[20px] text-xl font-bold text-white shadow-lg ${cor}`}>{children}</button>
}

function CartaoProduto({ produto: p }: { produto: Produto }) {
  const baixo = p.quantidade_atual <= p.estoque_minimo
  const pct = Math.min(100, (p.quantidade_atual / Math.max(p.estoque_minimo * 2, 1)) * 100)
  return (
    <div className={`rounded-[20px] border-2 bg-white p-5 shadow-sm ${baixo ? 'border-red-200' : 'border-zinc-100'}`}>
      <div className="flex justify-between">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold">{p.categoria || 'Sem categoria'}</span>
        <span className={`text-xs font-bold ${baixo ? 'text-red-600' : 'text-green-600'}`}>{baixo ? 'ALERTA' : 'OK'}</span>
      </div>
      <h3 className="mt-3 text-xl font-bold">{p.nome}</h3>
      <p className="mt-2 text-3xl font-black">{formatarQtd(p.quantidade_atual)} <span className="text-lg font-normal text-zinc-500">{p.unidade}</span></p>
      <div className="mt-3 h-2 rounded-full bg-zinc-100"><div className={`h-2 rounded-full ${baixo ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} /></div>
      <p className="mt-2 text-sm text-zinc-500">Disponível: {formatarQtd(p.quantidade_disponivel)} {p.unidade} • Reservado: {formatarQtd(p.quantidade_reservada)} {p.unidade}</p>
      <p className="mt-1 text-xs text-zinc-400">Alerta abaixo de {formatarQtd(p.estoque_minimo)} {p.unidade}</p>
    </div>
  )
}
