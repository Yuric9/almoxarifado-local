'use client'
import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, Boxes, CircleAlert, CircleCheck, ClipboardList, DatabaseBackup, History, LayoutDashboard, PackageCheck, Plus, Warehouse } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, mensagemErro } from '@/lib/cliente'
import type { Categoria, Movimentacao, Produto, RequisicaoDetalhe, RequisicaoResumo, ReservaResumo, Sistema } from '@/lib/tipos'
import { Comprovante } from '@/components/Comprovante'
import { EntradaModal, NovoProdutoModal, RequisicaoModal, ReservaModal, RetirarReservaModal } from '@/components/Formularios'
import { TelaBackup, TelaMateriais, TelaMovimentacoes, TelaPainel, TelaReservas, TelaRetiradas } from '@/components/Telas'
import { Botao } from '@/components/ui'

type Tela = 'painel' | 'materiais' | 'retiradas' | 'reservas' | 'movimentacoes' | 'backup'
type Janela = 'entrada' | 'novo' | 'requisicao' | 'reserva' | null
type Aviso = { texto: string; erro?: boolean }

const MENU: Array<{ id: Tela; rotulo: string; icone: LucideIcon }> = [
  { id: 'painel', rotulo: 'Painel', icone: LayoutDashboard },
  { id: 'materiais', rotulo: 'Materiais', icone: Boxes },
  { id: 'retiradas', rotulo: 'Retiradas', icone: ClipboardList },
  { id: 'reservas', rotulo: 'Reservas', icone: PackageCheck },
  { id: 'movimentacoes', rotulo: 'Movimentações', icone: History }
]

export default function Home() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [requisicoes, setRequisicoes] = useState<RequisicaoResumo[]>([])
  const [reservas, setReservas] = useState<ReservaResumo[]>([])
  const [sistema, setSistema] = useState<Sistema | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')

  const [tela, setTela] = useState<Tela>('painel')
  const [janela, setJanela] = useState<Janela>(null)
  const [retirando, setRetirando] = useState<ReservaResumo | null>(null)
  const [comprovante, setComprovante] = useState<RequisicaoDetalhe | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const notificar = useCallback((texto: string, erro = false) => {
    setAviso({ texto, erro })
    setTimeout(() => setAviso(atual => (atual?.texto === texto ? null : atual)), 4000)
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
      notificar(mensagemErro(e), true)
    }
  }

  async function acaoReserva(r: ReservaResumo, acao: 'aguardar' | 'cancelar') {
    try {
      if (acao === 'cancelar') {
        if (!window.confirm(`Cancelar a reserva ${r.numero}? Os materiais voltam a ficar disponíveis.`)) return
        await api(`/api/reservas/${r.id}`, { method: 'DELETE' })
        notificar(`Reserva ${r.numero} cancelada`)
      } else {
        await api(`/api/reservas/${r.id}`, { method: 'PATCH', json: { status: 'AGUARDANDO_RETIRADA' } })
        notificar(`Reserva ${r.numero} pronta para retirada`)
      }
      await recarregar()
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }

  const reservasAbertas = reservas.filter(r => r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA').length
  const acoesRapidas = (
    <>
      <Botao onClick={() => setJanela('entrada')} icone={<ArrowDownToLine size={16} />}>Registrar entrada</Botao>
      <Botao onClick={() => setJanela('reserva')} icone={<PackageCheck size={16} />}>Nova reserva</Botao>
      <Botao variante="primario" onClick={() => setJanela('requisicao')} icone={<Plus size={16} />}>Nova retirada</Botao>
    </>
  )

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-300 print:hidden">
          <div className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white"><Warehouse size={18} /></div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Almoxarifado</p>
              <p className="text-[11px] text-slate-400">Controle de estoque</p>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 p-2" aria-label="Menu principal">
            {MENU.map(({ id, rotulo, icone: Icone }) => (
              <ItemMenu key={id} ativo={tela === id} onClick={() => setTela(id)} icone={<Icone size={18} />} rotulo={rotulo}
                contador={id === 'reservas' && reservasAbertas ? reservasAbertas : undefined} />
            ))}
          </nav>
          <div className="border-t border-slate-800 p-2">
            <ItemMenu ativo={tela === 'backup'} onClick={() => setTela('backup')} icone={<DatabaseBackup size={18} />} rotulo="Backup" />
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-6">
            {erroCarga && (
              <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <CircleAlert size={16} /> Não foi possível carregar os dados: {erroCarga}
                <button onClick={recarregar} className="ml-auto font-medium underline">Tentar novamente</button>
              </div>
            )}

            {tela === 'painel' && <TelaPainel produtos={produtos} movs={movs} reservas={reservas} acoes={acoesRapidas} irPara={setTela} />}
            {tela === 'materiais' && <TelaMateriais produtos={produtos} categorias={categorias} carregando={carregando} aoNovo={() => setJanela('novo')} aoEntrada={() => setJanela('entrada')} />}
            {tela === 'retiradas' && <TelaRetiradas requisicoes={requisicoes} aoNova={() => setJanela('requisicao')} aoComprovante={abrirComprovante} />}
            {tela === 'reservas' && (
              <TelaReservas reservas={reservas} aoNova={() => setJanela('reserva')} aoAguardar={r => acaoReserva(r, 'aguardar')} aoRetirar={setRetirando} aoLiberar={r => acaoReserva(r, 'cancelar')} />
            )}
            {tela === 'movimentacoes' && <TelaMovimentacoes movs={movs} />}
            {tela === 'backup' && <TelaBackup aoRestaurar={recarregar} notificar={notificar} />}
          </div>
        </main>
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-200 bg-white px-4 text-[11px] text-slate-500 print:hidden">
        {sistema ? (
          <>
            <span>v{sistema.versao}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${sistema.modo === 'portatil' ? 'bg-blue-600' : 'bg-emerald-600'}`} />
              {sistema.modo === 'portatil' ? 'Modo portátil' : sistema.modo === 'instalado' ? 'Instalado' : 'Desenvolvimento'}
            </span>
            <span className="truncate" title={sistema.banco}>Dados: {sistema.pasta_dados}</span>
          </>
        ) : <span>Carregando…</span>}
      </footer>

      {janela === 'entrada' && <EntradaModal produtos={produtos} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'novo' && <NovoProdutoModal categorias={categorias} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'reserva' && <ReservaModal produtos={produtos} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'requisicao' && (
        <RequisicaoModal produtos={produtos} aoFechar={fechar} aoConcluir={async id => { await concluir('Retirada registrada'); await abrirComprovante(id) }} />
      )}
      {retirando && (
        <RetirarReservaModal reserva={retirando} aoFechar={() => setRetirando(null)} aoConcluir={async id => {
          setRetirando(null)
          await recarregar()
          notificar('Reserva retirada')
          await abrirComprovante(id)
        }} />
      )}
      {comprovante && <Comprovante requisicao={comprovante} aoFechar={() => setComprovante(null)} />}

      {aviso && (
        <div role="status" className={`fixed bottom-10 right-6 z-[60] flex max-w-sm items-start gap-2 rounded-md border bg-white px-4 py-3 text-sm shadow-lg print:hidden ${aviso.erro ? 'border-red-200 text-red-800' : 'border-slate-200 text-slate-800'}`}>
          {aviso.erro ? <CircleAlert size={18} className="shrink-0 text-red-600" /> : <CircleCheck size={18} className="shrink-0 text-emerald-600" />}
          <span>{aviso.texto}</span>
        </div>
      )}
    </div>
  )
}

function ItemMenu({ ativo, onClick, icone, rotulo, contador }: { ativo: boolean; onClick: () => void; icone: React.ReactNode; rotulo: string; contador?: number }) {
  return (
    <button
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${ativo ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white'}`}
    >
      {icone}
      <span className="flex-1 text-left">{rotulo}</span>
      {contador !== undefined && <span className="rounded bg-blue-600 px-1.5 text-[11px] font-semibold text-white">{contador}</span>}
    </button>
  )
}
