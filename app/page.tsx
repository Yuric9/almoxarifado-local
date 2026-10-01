'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine, BarChart3, Boxes, CircleAlert, CircleCheck, ClipboardList, DatabaseBackup, History,
  LayoutDashboard, PackageCheck, PackageMinus, Plus, Settings, Warehouse
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api, mensagemErro } from '@/lib/cliente'
import type {
  CategoriaResumo, Configuracoes, Movimentacao, Produto, RequisicaoDetalhe, RequisicaoResumo, ReservaDetalhe as Detalhe, ReservaResumo, Sistema
} from '@/lib/tipos'
import { TelaBackup } from '@/components/Backup'
import { Comprovante } from '@/components/Comprovante'
import { TelaConfiguracoes } from '@/components/Configuracoes'
import { EntradaModal, RequisicaoModal, ReservaModal, RetirarReservaModal } from '@/components/Formularios'
import { BaixaModal, FichaMaterial, MaterialFormModal } from '@/components/Material'
import { PlanilhasModal } from '@/components/Planilhas'
import { TelaRelatorios } from '@/components/Relatorios'
import { ReservaDetalhe } from '@/components/ReservaDetalhe'
import { TelaMateriais, TelaMovimentacoes, TelaPainel, TelaReservas, TelaRetiradas, type Navegar } from '@/components/Telas'
import { Botao } from '@/components/ui'

type Tela = 'painel' | 'materiais' | 'retiradas' | 'reservas' | 'movimentacoes' | 'relatorios' | 'backup' | 'configuracoes'
type Janela = 'entrada' | 'novo' | 'requisicao' | 'reserva' | 'baixa' | 'planilhas' | null
type Aviso = { texto: string; erro?: boolean }

const MENU: Array<{ id: Tela; rotulo: string; icone: LucideIcon }> = [
  { id: 'painel', rotulo: 'Painel', icone: LayoutDashboard },
  { id: 'materiais', rotulo: 'Materiais', icone: Boxes },
  { id: 'retiradas', rotulo: 'Retiradas', icone: ClipboardList },
  { id: 'reservas', rotulo: 'Reservas', icone: PackageCheck },
  { id: 'movimentacoes', rotulo: 'Movimentações', icone: History },
  { id: 'relatorios', rotulo: 'Relatórios', icone: BarChart3 }
]

const CONFIG_INICIAL: Configuracoes = {
  empresa_nome: '', empresa_setor: 'Almoxarifado', entregue_por_padrao: '', estoque_minimo_padrao: 5, backups_manter: 15, tema: 'sistema'
}

/** Aplica o tema na página e guarda a escolha para a próxima abertura (evita "piscar" claro). */
function useTema(tema: Configuracoes['tema']) {
  useEffect(() => {
    const midia = window.matchMedia('(prefers-color-scheme: dark)')
    const aplicar = () => {
      const escuro = tema === 'escuro' || (tema === 'sistema' && midia.matches)
      document.documentElement.classList.toggle('dark', escuro)
    }
    aplicar()
    try { localStorage.setItem('tema', tema) } catch { /* armazenamento indisponível */ }
    midia.addEventListener('change', aplicar)
    return () => midia.removeEventListener('change', aplicar)
  }, [tema])
}

export default function Home() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<CategoriaResumo[]>([])
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [requisicoes, setRequisicoes] = useState<RequisicaoResumo[]>([])
  const [reservas, setReservas] = useState<ReservaResumo[]>([])
  const [sistema, setSistema] = useState<Sistema | null>(null)
  const [config, setConfig] = useState<Configuracoes>(CONFIG_INICIAL)
  const [configCarregada, setConfigCarregada] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [versao, setVersao] = useState(0)

  const [tela, setTela] = useState<Tela>('painel')
  const [filtroAlerta, setFiltroAlerta] = useState(false)
  const [filtroHoje, setFiltroHoje] = useState(false)
  const [janela, setJanela] = useState<Janela>(null)
  const [materialAberto, setMaterialAberto] = useState<number | null>(null)
  const [reservaAberta, setReservaAberta] = useState<number | null>(null)
  const [editandoReserva, setEditandoReserva] = useState<Detalhe | null>(null)
  const [retirando, setRetirando] = useState<Pick<ReservaResumo, 'id' | 'numero' | 'finalidade'> | null>(null)
  const [comprovante, setComprovante] = useState<RequisicaoDetalhe | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)

  useTema(config.tema)

  const notificar = useCallback((texto: string, erro = false) => {
    setAviso({ texto, erro })
    setTimeout(() => setAviso(atual => (atual?.texto === texto ? null : atual)), 4000)
  }, [])

  const carregarCategorias = useCallback(async () => {
    setCategorias(await api<CategoriaResumo[]>('/api/categorias'))
  }, [])

  const recarregar = useCallback(async () => {
    try {
      const [p, m, r, s, c] = await Promise.all([
        api<Produto[]>('/api/produtos'),
        api<Movimentacao[]>('/api/movimentacoes?limite=300'),
        api<RequisicaoResumo[]>('/api/requisicoes'),
        api<ReservaResumo[]>('/api/reservas'),
        api<CategoriaResumo[]>('/api/categorias')
      ])
      setProdutos(p); setMovs(m); setRequisicoes(r); setReservas(s); setCategorias(c)
      setVersao(v => v + 1)
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
    api<Configuracoes>('/api/configuracoes').then(c => { setConfig(c); setConfigCarregada(true) }).catch(e => notificar(mensagemErro(e), true))
  }, [recarregar, notificar])

  const produtosAtivos = useMemo(() => produtos.filter(p => p.ativo), [produtos])
  const fechar = useCallback(() => setJanela(null), [])

  async function concluir(msg: string) {
    setJanela(null)
    await recarregar()
    notificar(msg)
  }

  async function alterado(msg: string) {
    await recarregar()
    notificar(msg)
  }

  const abrirComprovante = useCallback(async (id: number) => {
    try {
      setComprovante(await api<RequisicaoDetalhe>(`/api/requisicoes/${id}`))
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }, [notificar])

  async function acaoReserva(r: Pick<ReservaResumo, 'id' | 'numero'>, acao: 'aguardar' | 'cancelar') {
    try {
      if (acao === 'cancelar') {
        if (!window.confirm(`Cancelar a reserva ${r.numero}? Os materiais voltam a ficar disponíveis.`)) return
        await api(`/api/reservas/${r.id}`, { method: 'DELETE' })
        await alterado(`Reserva ${r.numero} cancelada`)
      } else {
        await api(`/api/reservas/${r.id}`, { method: 'PATCH', json: { status: 'AGUARDANDO_RETIRADA' } })
        await alterado(`Reserva ${r.numero} pronta para retirada`)
      }
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }

  const navegar: Navegar = destino => {
    setFiltroAlerta(destino.tela === 'materiais' && !!destino.alerta)
    setFiltroHoje(destino.tela === 'movimentacoes' && !!destino.hoje)
    setTela(destino.tela)
  }

  function irPara(id: Tela) {
    setFiltroAlerta(false)
    setFiltroHoje(false)
    setTela(id)
  }

  const reservasAbertas = reservas.filter(r => r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA').length
  const acoesRapidas = (
    <>
      <Botao onClick={() => setJanela('entrada')} icone={<ArrowDownToLine size={16} />}>Registrar entrada</Botao>
      <Botao onClick={() => setJanela('baixa')} icone={<PackageMinus size={16} />}>Dar baixa</Botao>
      <Botao onClick={() => setJanela('reserva')} icone={<PackageCheck size={16} />}>Nova reserva</Botao>
      <Botao variante="primario" onClick={() => setJanela('requisicao')} icone={<Plus size={16} />}>Nova retirada</Botao>
    </>
  )

  return (
    <div className="flex h-screen flex-col bg-fundo text-slate-900">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col bg-[#0f172a] text-[#cbd5e1] print:hidden">
          <div className="flex h-14 items-center gap-2.5 border-b border-[#1e293b] px-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white"><Warehouse size={18} /></div>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold text-white">Almoxarifado</p>
              <p className="truncate text-[11px] text-[#94a3b8]">{config.empresa_nome || 'Controle de estoque'}</p>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 p-2" aria-label="Menu principal">
            {MENU.map(({ id, rotulo, icone: Icone }) => (
              <ItemMenu key={id} ativo={tela === id} onClick={() => irPara(id)} icone={<Icone size={18} />} rotulo={rotulo}
                contador={id === 'reservas' && reservasAbertas ? reservasAbertas : undefined} />
            ))}
          </nav>
          <div className="space-y-0.5 border-t border-[#1e293b] p-2">
            <ItemMenu ativo={tela === 'backup'} onClick={() => irPara('backup')} icone={<DatabaseBackup size={18} />} rotulo="Backup" />
            <ItemMenu ativo={tela === 'configuracoes'} onClick={() => irPara('configuracoes')} icone={<Settings size={18} />} rotulo="Configurações" />
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

            {tela === 'painel' && (
              <TelaPainel produtos={produtos} movs={movs} reservas={reservas} acoes={acoesRapidas} navegar={navegar} abrirMaterial={setMaterialAberto} abrirComprovante={abrirComprovante} />
            )}
            {tela === 'materiais' && (
              <TelaMateriais produtos={produtos} categorias={categorias} carregando={carregando} filtroAlerta={filtroAlerta}
                aoNovo={() => setJanela('novo')} aoEntrada={() => setJanela('entrada')} aoBaixa={() => setJanela('baixa')} aoPlanilhas={() => setJanela('planilhas')} abrirMaterial={setMaterialAberto} />
            )}
            {tela === 'retiradas' && <TelaRetiradas requisicoes={requisicoes} aoNova={() => setJanela('requisicao')} aoComprovante={abrirComprovante} />}
            {tela === 'reservas' && <TelaReservas reservas={reservas} aoNova={() => setJanela('reserva')} abrirReserva={setReservaAberta} />}
            {tela === 'movimentacoes' && <TelaMovimentacoes filtroHoje={filtroHoje} versao={versao} abrirMaterial={setMaterialAberto} abrirComprovante={abrirComprovante} />}
            {tela === 'relatorios' && <TelaRelatorios empresa={config.empresa_nome} />}
            {tela === 'backup' && <TelaBackup aoRestaurar={recarregar} notificar={notificar} />}
            {tela === 'configuracoes' && !configCarregada && <p className="py-10 text-center text-sm text-slate-500">Carregando…</p>}
            {tela === 'configuracoes' && configCarregada && (
              <TelaConfiguracoes config={config} sistema={sistema} categorias={categorias} aoSalvar={setConfig}
                aoAlterarCategorias={recarregar} notificar={notificar} abrirBackup={() => irPara('backup')} abrirPlanilhas={() => setJanela('planilhas')} />
            )}
          </div>
        </main>
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-200 bg-superficie px-4 text-[11px] text-slate-500 print:hidden">
        {sistema ? (
          <>
            <span>v{sistema.versao}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${sistema.modo === 'portatil' ? 'bg-blue-600' : 'bg-emerald-600'}`} />
              {sistema.modo === 'portatil' ? 'Modo portátil' : sistema.modo === 'instalado' ? 'Instalado' : 'Desenvolvimento'}
            </span>
            <span className="min-w-0 truncate" title={sistema.banco}>Dados: {sistema.pasta_dados}</span>
          </>
        ) : <span>Carregando…</span>}
        <span className="ml-auto shrink-0 text-slate-400">Sistema desenvolvido por YC Soluções Tecnológicas</span>
      </footer>

      {janela === 'entrada' && <EntradaModal produtos={produtosAtivos} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'baixa' && <BaixaModal produtos={produtosAtivos} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'novo' && <MaterialFormModal categorias={categorias} aoFechar={fechar} aoConcluir={concluir} aoCriarCategoria={carregarCategorias} />}
      {janela === 'reserva' && <ReservaModal produtos={produtosAtivos} aoFechar={fechar} aoConcluir={concluir} />}
      {janela === 'planilhas' && <PlanilhasModal aoFechar={fechar} aoImportar={alterado} />}
      {janela === 'requisicao' && (
        <RequisicaoModal produtos={produtosAtivos} entreguePorPadrao={config.entregue_por_padrao} aoFechar={fechar}
          aoConcluir={async id => { await concluir('Retirada registrada'); await abrirComprovante(id) }} />
      )}

      {materialAberto !== null && (
        <FichaMaterial produtoId={materialAberto} produtos={produtosAtivos} categorias={categorias} aoFechar={() => setMaterialAberto(null)}
          aoAlterar={alterado} aoCriarCategoria={carregarCategorias} abrirComprovante={abrirComprovante} abrirReserva={setReservaAberta} />
      )}

      {reservaAberta !== null && (
        <ReservaDetalhe reservaId={reservaAberta} versao={versao} aoFechar={() => setReservaAberta(null)}
          aoEditar={setEditandoReserva} aoRetirar={setRetirando}
          aoAguardar={r => acaoReserva(r, 'aguardar')} aoCancelar={r => acaoReserva(r, 'cancelar')} abrirComprovante={abrirComprovante} />
      )}
      {editandoReserva && (
        <ReservaModal produtos={produtosAtivos} reserva={editandoReserva} aoFechar={() => setEditandoReserva(null)}
          aoConcluir={async msg => { setEditandoReserva(null); await alterado(msg) }} />
      )}
      {retirando && (
        <RetirarReservaModal reserva={retirando} aoFechar={() => setRetirando(null)} aoConcluir={async id => {
          setRetirando(null)
          setReservaAberta(null)
          await alterado('Reserva retirada')
          await abrirComprovante(id)
        }} />
      )}
      {comprovante && (
        <Comprovante requisicao={comprovante} empresa={config.empresa_nome} setor={config.empresa_setor} aoFechar={() => setComprovante(null)}
          aoEstornar={async msg => { await alterado(msg); await abrirComprovante(comprovante.id) }} />
      )}

      {aviso && (
        <div role="status" className={`fixed bottom-10 right-6 z-[70] flex max-w-sm items-start gap-2 rounded-md border bg-superficie px-4 py-3 text-sm shadow-lg print:hidden ${aviso.erro ? 'border-red-200 text-red-800' : 'border-slate-200 text-slate-800'}`}>
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
      className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${ativo ? 'bg-[#1e293b] text-white' : 'hover:bg-[#1e293b]/60 hover:text-white'}`}
    >
      {icone}
      <span className="flex-1 text-left">{rotulo}</span>
      {contador !== undefined && <span className="rounded bg-blue-600 px-1.5 text-[11px] font-semibold text-white">{contador}</span>}
    </button>
  )
}
