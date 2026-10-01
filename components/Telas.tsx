'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, FileSpreadsheet, FileText, PackageMinus, Plus, Search } from 'lucide-react'
import { api, ehHoje, formatarData, formatarQtd, mensagemErro } from '@/lib/cliente'
import { descreverOrigem, type CategoriaResumo, type Movimentacao, type Produto, type RequisicaoResumo, type ReservaResumo } from '@/lib/tipos'
import { Badge, Botao, CabecalhoPagina, Painel, Tabela, celula, celulaNumero, classeCampo } from './ui'

const linhaClicavel = 'cursor-pointer hover:bg-slate-50'

function situacao(p: Produto) {
  if (!p.ativo) return <Badge>Inativo</Badge>
  if (p.quantidade_atual <= 0) return <Badge tom="vermelho">Sem estoque</Badge>
  if (p.quantidade_atual <= p.estoque_minimo) return <Badge tom="amarelo">Abaixo do mínimo</Badge>
  return <Badge tom="verde">Normal</Badge>
}

export function StatusReserva({ status }: { status: string }) {
  if (status === 'SEPARADO') return <Badge tom="azul">Separado</Badge>
  if (status === 'AGUARDANDO_RETIRADA') return <Badge tom="amarelo">Aguardando retirada</Badge>
  if (status === 'RETIRADO') return <Badge tom="verde">Retirado</Badge>
  return <Badge>Cancelado</Badge>
}

function TipoMovimento({ m }: { m: Movimentacao }) {
  const tom = m.origem === 'BAIXA' ? 'vermelho' : m.origem === 'AJUSTE' || m.origem === 'ESTORNO' ? 'azul' : m.tipo === 'ENTRADA' ? 'verde' : 'neutro'
  return <Badge tom={tom}>{descreverOrigem(m)}</Badge>
}

/* ------------------------------------------------------------------ painel */

function Indicador({ rotulo, valor, detalhe, alerta, onClick }: { rotulo: string; valor: number; detalhe?: string; alerta?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group rounded-lg border border-slate-200 bg-superficie px-4 py-3 text-left transition hover:border-blue-400 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40">
      <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
        {rotulo}
        <ChevronRight size={14} className="text-slate-400 opacity-0 transition group-hover:opacity-100" />
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alerta && valor > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </button>
  )
}

export type Navegar = (destino:
  | { tela: 'materiais'; alerta?: boolean }
  | { tela: 'reservas' }
  | { tela: 'retiradas' }
  | { tela: 'movimentacoes'; hoje?: boolean }
) => void

export function TelaPainel({ produtos, movs, reservas, acoes, navegar, abrirMaterial, abrirComprovante }: {
  produtos: Produto[]
  movs: Movimentacao[]
  reservas: ReservaResumo[]
  acoes: ReactNode
  navegar: Navegar
  abrirMaterial: (id: number) => void
  abrirComprovante: (id: number) => void
}) {
  const ativos = produtos.filter(p => p.ativo)
  const alerta = ativos.filter(p => p.quantidade_atual <= p.estoque_minimo)
  const abertas = reservas.filter(r => r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA')
  const hoje = movs.filter(m => ehHoje(m.criado_em))

  return (
    <>
      <CabecalhoPagina titulo="Painel" descricao="Resumo do estoque" acoes={acoes} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Materiais" valor={ativos.length} detalhe="cadastrados e ativos" onClick={() => navegar({ tela: 'materiais' })} />
        <Indicador rotulo="Abaixo do mínimo" valor={alerta.length} detalhe="precisam de reposição" alerta onClick={() => navegar({ tela: 'materiais', alerta: true })} />
        <Indicador rotulo="Reservas abertas" valor={abertas.length} detalhe={`${abertas.filter(r => r.status === 'AGUARDANDO_RETIRADA').length} aguardando retirada`} onClick={() => navegar({ tela: 'reservas' })} />
        <Indicador rotulo="Movimentações hoje" valor={hoje.length} detalhe={`${hoje.filter(m => m.tipo === 'ENTRADA').length} entradas · ${hoje.filter(m => m.tipo === 'SAIDA').length} saídas`} onClick={() => navegar({ tela: 'movimentacoes', hoje: true })} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Painel titulo="Reposição necessária" acoes={<Botao variante="fantasma" onClick={() => navegar({ tela: 'materiais', alerta: true })}>Ver todos</Botao>} semPadding>
          <Tabela colunas={[{ titulo: 'Material' }, { titulo: 'Estoque', alinhar: 'direita' }, { titulo: 'Mínimo', alinhar: 'direita' }]} vazio="Nenhum material abaixo do mínimo.">
            {alerta.slice(0, 8).map(p => (
              <tr key={p.id} onClick={() => abrirMaterial(p.id)} className={linhaClicavel}>
                <td className={celula}>{p.nome}</td>
                <td className={`${celulaNumero} font-medium text-amber-700`}>{formatarQtd(p.quantidade_atual)} {p.unidade}</td>
                <td className={`${celulaNumero} text-slate-500`}>{formatarQtd(p.estoque_minimo)}</td>
              </tr>
            ))}
          </Tabela>
        </Painel>

        <Painel titulo="Últimas movimentações" acoes={<Botao variante="fantasma" onClick={() => navegar({ tela: 'movimentacoes' })}>Ver todas</Botao>} semPadding>
          <Tabela colunas={[{ titulo: 'Data' }, { titulo: 'Material' }, { titulo: 'Qtd.', alinhar: 'direita' }]} vazio="Nenhuma movimentação registrada.">
            {movs.slice(0, 8).map(m => (
              <tr key={m.id} onClick={() => (m.requisicao_id ? abrirComprovante(m.requisicao_id) : abrirMaterial(m.produto_id))} className={linhaClicavel}>
                <td className={`${celula} whitespace-nowrap text-slate-500`}>{formatarData(m.criado_em)}</td>
                <td className={celula}>
                  <span className="inline-flex items-center gap-2">
                    {m.tipo === 'ENTRADA'
                      ? <ArrowDownToLine size={14} className="text-emerald-600" aria-label="Entrada" />
                      : <ArrowUpFromLine size={14} className={m.origem === 'BAIXA' ? 'text-red-600' : 'text-slate-500'} aria-label="Saída" />}
                    {m.produto_nome}
                  </span>
                </td>
                <td className={`${celulaNumero} whitespace-nowrap`}>{m.tipo === 'SAIDA' ? '−' : '+'}{formatarQtd(m.quantidade)} {m.unidade}</td>
              </tr>
            ))}
          </Tabela>
        </Painel>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ materiais */

export function TelaMateriais({ produtos, categorias, carregando, filtroAlerta, aoNovo, aoEntrada, aoBaixa, aoPlanilhas, abrirMaterial }: {
  produtos: Produto[]
  categorias: CategoriaResumo[]
  carregando: boolean
  filtroAlerta?: boolean
  aoNovo: () => void
  aoEntrada: () => void
  aoBaixa: () => void
  aoPlanilhas: () => void
  abrirMaterial: (id: number) => void
}) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [soAlerta, setSoAlerta] = useState(!!filtroAlerta)
  const [inativos, setInativos] = useState(false)
  useEffect(() => { setSoAlerta(!!filtroAlerta) }, [filtroAlerta])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return produtos.filter(p =>
      (inativos || p.ativo) &&
      (!categoria || String(p.categoria_id) === categoria) &&
      (!soAlerta || (p.ativo && p.quantidade_atual <= p.estoque_minimo)) &&
      [p.nome, p.codigo, p.localizacao].some(v => v?.toLocaleLowerCase('pt-BR').includes(termo))
    )
  }, [produtos, busca, categoria, soAlerta, inativos])

  return (
    <>
      <CabecalhoPagina
        titulo="Materiais"
        descricao="Clique em um material para ver a ficha, editar, dar baixa ou ajustar o estoque"
        acoes={<>
          <Botao onClick={aoPlanilhas} icone={<FileSpreadsheet size={16} />}>Planilhas</Botao>
          <Botao onClick={aoBaixa} icone={<PackageMinus size={16} />}>Dar baixa</Botao>
          <Botao onClick={aoEntrada} icone={<ArrowDownToLine size={16} />}>Registrar entrada</Botao>
          <Botao variante="primario" onClick={aoNovo} icone={<Plus size={16} />}>Novo material</Botao>
        </>}
      />
      <Painel semPadding>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, código ou localização" aria-label="Buscar material" className={`${classeCampo} w-full pl-8`} />
          </div>
          <select aria-label="Filtrar por categoria" value={categoria} onChange={e => setCategoria(e.target.value)} className={classeCampo}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={soAlerta} onChange={e => setSoAlerta(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Só abaixo do mínimo
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={inativos} onChange={e => setInativos(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Mostrar inativos
          </label>
          <span className="ml-auto text-xs text-slate-500">{filtrados.length} de {produtos.length}</span>
        </div>
        <Tabela
          colunas={[
            { titulo: 'Código' }, { titulo: 'Material' }, { titulo: 'Categoria' }, { titulo: 'Local' }, { titulo: 'Físico', alinhar: 'direita' },
            { titulo: 'Reservado', alinhar: 'direita' }, { titulo: 'Disponível', alinhar: 'direita' }, { titulo: 'Mínimo', alinhar: 'direita' }, { titulo: 'Un.' }, { titulo: 'Situação' }
          ]}
          vazio={carregando ? 'Carregando…' : produtos.length === 0 ? 'Nenhum material cadastrado. Use "Novo material" ou importe uma planilha.' : 'Nenhum material encontrado com esses filtros.'}
        >
          {filtrados.map(p => (
            <tr key={p.id} onClick={() => abrirMaterial(p.id)} className={`${linhaClicavel} ${p.ativo ? '' : 'opacity-60'}`}>
              <td className={`${celula} whitespace-nowrap font-mono text-xs text-slate-500`}>{p.codigo || '—'}</td>
              <td className={`${celula} font-medium text-slate-900`}>{p.nome}</td>
              <td className={`${celula} text-slate-600`}>{p.categoria || '—'}</td>
              <td className={`${celula} text-slate-600`}>{p.localizacao || '—'}</td>
              <td className={celulaNumero}>{formatarQtd(p.quantidade_atual)}</td>
              <td className={`${celulaNumero} text-slate-500`}>{p.quantidade_reservada ? formatarQtd(p.quantidade_reservada) : '—'}</td>
              <td className={`${celulaNumero} font-medium`}>{formatarQtd(p.quantidade_disponivel)}</td>
              <td className={`${celulaNumero} text-slate-500`}>{formatarQtd(p.estoque_minimo)}</td>
              <td className={`${celula} text-slate-500`}>{p.unidade}</td>
              <td className={celula}>{situacao(p)}</td>
            </tr>
          ))}
        </Tabela>
      </Painel>
    </>
  )
}

/* ------------------------------------------------------------------ retiradas */

export function TelaRetiradas({ requisicoes, aoNova, aoComprovante }: {
  requisicoes: RequisicaoResumo[]
  aoNova: () => void
  aoComprovante: (id: number) => void
}) {
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLocaleLowerCase('pt-BR')
  const lista = requisicoes.filter(r => [r.numero, r.retirado_por, r.setor, r.finalidade].some(v => v?.toLocaleLowerCase('pt-BR').includes(termo)))

  return (
    <>
      <CabecalhoPagina
        titulo="Retiradas"
        descricao="Requisições de material. Clique em uma linha para ver, imprimir ou estornar o comprovante."
        acoes={<Botao variante="primario" onClick={aoNova} icone={<Plus size={16} />}>Nova retirada</Botao>}
      />
      <Painel semPadding>
        <div className="border-b border-slate-200 p-3">
          <div className="relative max-w-md">
            <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, pessoa, setor ou finalidade" aria-label="Buscar retirada" className={`${classeCampo} w-full pl-8`} />
          </div>
        </div>
        <Tabela
          colunas={[{ titulo: 'Número' }, { titulo: 'Data' }, { titulo: 'Retirado por' }, { titulo: 'Setor' }, { titulo: 'Finalidade' }, { titulo: 'Itens', alinhar: 'direita' }, { titulo: 'Situação' }, { titulo: '', largura: 'w-10' }]}
          vazio="Nenhuma retirada encontrada."
        >
          {lista.map(r => (
            <tr key={r.id} onClick={() => aoComprovante(r.id)} className={`${linhaClicavel} ${r.status === 'CANCELADA' ? 'opacity-60' : ''}`}>
              <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{r.numero}</td>
              <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(r.criado_em)}</td>
              <td className={`${celula} font-medium`}>{r.retirado_por}</td>
              <td className={`${celula} text-slate-600`}>{r.setor || '—'}</td>
              <td className={`${celula} text-slate-600`}>{r.finalidade || '—'}{r.reserva_numero && <span className="ml-2"><Badge tom="azul">{r.reserva_numero}</Badge></span>}</td>
              <td className={celulaNumero}>{r.total_itens}</td>
              <td className={celula}>{r.status === 'CANCELADA' ? <Badge tom="vermelho">Estornada</Badge> : <Badge tom="verde">Finalizada</Badge>}</td>
              <td className={`${celula} text-slate-400`}><FileText size={16} /></td>
            </tr>
          ))}
        </Tabela>
      </Painel>
    </>
  )
}

/* ------------------------------------------------------------------ reservas */

export function TelaReservas({ reservas, aoNova, abrirReserva }: {
  reservas: ReservaResumo[]
  aoNova: () => void
  abrirReserva: (id: number) => void
}) {
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false)
  const lista = mostrarEncerradas ? reservas : reservas.filter(r => r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA')

  return (
    <>
      <CabecalhoPagina
        titulo="Reservas"
        descricao="Pedidos separados. Clique em um pedido para ver os itens, editar, retirar ou cancelar."
        acoes={<Botao variante="primario" onClick={aoNova} icone={<Plus size={16} />}>Nova reserva</Botao>}
      />
      <Painel semPadding>
        <div className="flex items-center border-b border-slate-200 p-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={mostrarEncerradas} onChange={e => setMostrarEncerradas(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Mostrar retiradas e canceladas
          </label>
        </div>
        <Tabela
          colunas={[{ titulo: 'Número' }, { titulo: 'Data' }, { titulo: 'Finalidade' }, { titulo: 'Responsável' }, { titulo: 'Itens', alinhar: 'direita' }, { titulo: 'Status' }, { titulo: '', largura: 'w-10' }]}
          vazio={mostrarEncerradas ? 'Nenhuma reserva registrada.' : 'Nenhuma reserva aberta.'}
        >
          {lista.map(r => (
            <tr key={r.id} onClick={() => abrirReserva(r.id)} className={linhaClicavel}>
              <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{r.numero}</td>
              <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(r.criado_em)}</td>
              <td className={`${celula} font-medium`}>{r.finalidade}</td>
              <td className={`${celula} text-slate-600`}>{r.reservado_por || '—'}</td>
              <td className={celulaNumero}>{r.total_itens}</td>
              <td className={celula}><StatusReserva status={r.status} /></td>
              <td className={`${celula} text-slate-400`}><ChevronRight size={16} /></td>
            </tr>
          ))}
        </Tabela>
      </Painel>
    </>
  )
}

/* ------------------------------------------------------------------ movimentações */

function dataLocal(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function TelaMovimentacoes({ filtroHoje, versao, abrirMaterial, abrirComprovante }: {
  filtroHoje?: boolean
  /** Muda quando há novas movimentações, para recarregar. */
  versao: number
  abrirMaterial: (id: number) => void
  abrirComprovante: (id: number) => void
}) {
  const [inicio, setInicio] = useState(filtroHoje ? dataLocal() : '')
  const [fim, setFim] = useState(filtroHoje ? dataLocal() : '')
  const [tipo, setTipo] = useState('')
  const [lista, setLista] = useState<Movimentacao[]>([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (filtroHoje) { setInicio(dataLocal()); setFim(dataLocal()) }
  }, [filtroHoje])

  useEffect(() => {
    const q = new URLSearchParams({ limite: '1000' })
    if (inicio) q.set('inicio', inicio)
    if (fim) q.set('fim', fim)
    if (tipo) q.set('tipo', tipo)
    api<Movimentacao[]>(`/api/movimentacoes?${q}`).then(l => { setLista(l); setErro('') }).catch(e => setErro(mensagemErro(e)))
  }, [inicio, fim, tipo, versao])

  return (
    <>
      <CabecalhoPagina titulo="Movimentações" descricao="Histórico de entradas, saídas, baixas e ajustes" />
      <Painel semPadding>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 text-sm text-slate-600">
          <select aria-label="Filtrar por tipo" value={tipo} onChange={e => setTipo(e.target.value)} className={classeCampo}>
            <option value="">Entradas e saídas</option>
            <option value="ENTRADA">Somente entradas</option>
            <option value="SAIDA">Somente saídas</option>
          </select>
          <span className="ml-2">De</span>
          <input type="date" aria-label="Data inicial" value={inicio} onChange={e => setInicio(e.target.value)} className={classeCampo} />
          <span>até</span>
          <input type="date" aria-label="Data final" value={fim} onChange={e => setFim(e.target.value)} className={classeCampo} />
          <Botao variante="fantasma" onClick={() => { setInicio(dataLocal()); setFim(dataLocal()) }}>Hoje</Botao>
          {(inicio || fim) && <Botao variante="fantasma" onClick={() => { setInicio(''); setFim('') }}>Limpar datas</Botao>}
          <span className="ml-auto text-xs text-slate-500">{lista.length} registro(s){lista.length >= 1000 ? ' (limite)' : ''}</span>
        </div>
        {erro && <p className="px-4 py-2 text-sm text-red-700">{erro}</p>}
        <Tabela
          colunas={[{ titulo: 'Data' }, { titulo: 'Movimento' }, { titulo: 'Material' }, { titulo: 'Quantidade', alinhar: 'direita' }, { titulo: 'Responsável' }, { titulo: 'Observação' }]}
          vazio="Nenhuma movimentação no período."
        >
          {lista.map(m => (
            <tr key={m.id} onClick={() => (m.requisicao_id ? abrirComprovante(m.requisicao_id) : abrirMaterial(m.produto_id))} className={linhaClicavel}>
              <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(m.criado_em)}</td>
              <td className={celula}><TipoMovimento m={m} /></td>
              <td className={`${celula} font-medium`}>{m.produto_nome}</td>
              <td className={`${celulaNumero} whitespace-nowrap`}>{m.tipo === 'SAIDA' ? '−' : '+'}{formatarQtd(m.quantidade)} {m.unidade}</td>
              <td className={`${celula} text-slate-600`}>{m.responsavel || '—'}</td>
              <td className={`${celula} max-w-xs truncate text-slate-500`} title={m.observacao || ''}>{m.observacao || '—'}</td>
            </tr>
          ))}
        </Tabela>
      </Painel>
    </>
  )
}
