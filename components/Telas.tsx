'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Download, FileText, HardDrive, PackageCheck, Plus, Search, TriangleAlert, Upload } from 'lucide-react'
import { api, ehHoje, formatarData, formatarQtd, mensagemErro } from '@/lib/cliente'
import type { Categoria, Movimentacao, Produto, RequisicaoResumo, ReservaResumo } from '@/lib/tipos'
import { Badge, Botao, CabecalhoPagina, Painel, Tabela, celula, celulaNumero, classeCampo, classeInput } from './ui'

const ORIGEM: Record<string, string> = {
  ESTOQUE_INICIAL: 'Estoque inicial',
  ENTRADA_MANUAL: 'Entrada',
  REQUISICAO: 'Requisição',
  RESERVA: 'Reserva',
  MANUAL: 'Manual'
}

function situacao(p: Produto) {
  if (p.quantidade_atual <= 0) return <Badge tom="vermelho">Sem estoque</Badge>
  if (p.quantidade_atual <= p.estoque_minimo) return <Badge tom="amarelo">Abaixo do mínimo</Badge>
  return <Badge tom="verde">Normal</Badge>
}

function StatusReserva({ status }: { status: string }) {
  if (status === 'SEPARADO') return <Badge tom="azul">Separado</Badge>
  if (status === 'AGUARDANDO_RETIRADA') return <Badge tom="amarelo">Aguardando retirada</Badge>
  if (status === 'RETIRADO') return <Badge tom="verde">Retirado</Badge>
  return <Badge>Cancelado</Badge>
}

/* ------------------------------------------------------------------ painel */

function Indicador({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: number; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alerta && valor > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </div>
  )
}

export function TelaPainel({ produtos, movs, reservas, acoes, irPara }: {
  produtos: Produto[]
  movs: Movimentacao[]
  reservas: ReservaResumo[]
  acoes: ReactNode
  irPara: (tela: 'materiais' | 'reservas' | 'movimentacoes') => void
}) {
  const alerta = produtos.filter(p => p.quantidade_atual <= p.estoque_minimo)
  const abertas = reservas.filter(r => r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA')
  const hoje = movs.filter(m => ehHoje(m.criado_em))

  return (
    <>
      <CabecalhoPagina titulo="Painel" descricao="Resumo do estoque" acoes={acoes} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Materiais" valor={produtos.length} detalhe="cadastrados" />
        <Indicador rotulo="Abaixo do mínimo" valor={alerta.length} detalhe="precisam de reposição" alerta />
        <Indicador rotulo="Reservas abertas" valor={abertas.length} detalhe={`${abertas.filter(r => r.status === 'AGUARDANDO_RETIRADA').length} aguardando retirada`} />
        <Indicador rotulo="Movimentações hoje" valor={hoje.length} detalhe={`${hoje.filter(m => m.tipo === 'ENTRADA').length} entradas · ${hoje.filter(m => m.tipo === 'SAIDA').length} saídas`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Painel titulo="Reposição necessária" acoes={<Botao variante="fantasma" onClick={() => irPara('materiais')}>Ver materiais</Botao>} semPadding>
          <Tabela colunas={[{ titulo: 'Material' }, { titulo: 'Estoque', alinhar: 'direita' }, { titulo: 'Mínimo', alinhar: 'direita' }]} vazio="Nenhum material abaixo do mínimo.">
            {alerta.slice(0, 8).map(p => (
              <tr key={p.id}>
                <td className={celula}>{p.nome}</td>
                <td className={`${celulaNumero} font-medium text-amber-700`}>{formatarQtd(p.quantidade_atual)} {p.unidade}</td>
                <td className={`${celulaNumero} text-slate-500`}>{formatarQtd(p.estoque_minimo)}</td>
              </tr>
            ))}
          </Tabela>
        </Painel>

        <Painel titulo="Últimas movimentações" acoes={<Botao variante="fantasma" onClick={() => irPara('movimentacoes')}>Ver todas</Botao>} semPadding>
          <Tabela colunas={[{ titulo: 'Data' }, { titulo: 'Material' }, { titulo: 'Qtd.', alinhar: 'direita' }]} vazio="Nenhuma movimentação registrada.">
            {movs.slice(0, 8).map(m => (
              <tr key={m.id}>
                <td className={`${celula} whitespace-nowrap text-slate-500`}>{formatarData(m.criado_em)}</td>
                <td className={celula}>
                  <span className="inline-flex items-center gap-2">
                    {m.tipo === 'ENTRADA'
                      ? <ArrowDownToLine size={14} className="text-emerald-600" aria-label="Entrada" />
                      : <ArrowUpFromLine size={14} className="text-slate-500" aria-label="Saída" />}
                    {m.produto_nome}
                  </span>
                </td>
                <td className={celulaNumero}>{m.tipo === 'SAIDA' ? '−' : '+'}{formatarQtd(m.quantidade)} {m.unidade}</td>
              </tr>
            ))}
          </Tabela>
        </Painel>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ materiais */

export function TelaMateriais({ produtos, categorias, carregando, aoNovo, aoEntrada }: {
  produtos: Produto[]
  categorias: Categoria[]
  carregando: boolean
  aoNovo: () => void
  aoEntrada: () => void
}) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [soAlerta, setSoAlerta] = useState(false)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return produtos.filter(p =>
      (!categoria || String(p.categoria_id) === categoria) &&
      (!soAlerta || p.quantidade_atual <= p.estoque_minimo) &&
      p.nome.toLocaleLowerCase('pt-BR').includes(termo)
    )
  }, [produtos, busca, categoria, soAlerta])

  return (
    <>
      <CabecalhoPagina
        titulo="Materiais"
        descricao="Estoque físico, reservado e disponível por material"
        acoes={<>
          <Botao onClick={aoEntrada} icone={<ArrowDownToLine size={16} />}>Registrar entrada</Botao>
          <Botao variante="primario" onClick={aoNovo} icone={<Plus size={16} />}>Novo material</Botao>
        </>}
      />
      <Painel semPadding>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar material" aria-label="Buscar material" className={`${classeInput} pl-8`} />
          </div>
          <select aria-label="Filtrar por categoria" value={categoria} onChange={e => setCategoria(e.target.value)} className={classeCampo}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={soAlerta} onChange={e => setSoAlerta(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Só abaixo do mínimo
          </label>
          <span className="ml-auto text-xs text-slate-500">{filtrados.length} de {produtos.length}</span>
        </div>
        <Tabela
          colunas={[
            { titulo: 'Material' }, { titulo: 'Categoria' }, { titulo: 'Físico', alinhar: 'direita' }, { titulo: 'Reservado', alinhar: 'direita' },
            { titulo: 'Disponível', alinhar: 'direita' }, { titulo: 'Mínimo', alinhar: 'direita' }, { titulo: 'Un.' }, { titulo: 'Situação' }
          ]}
          vazio={carregando ? 'Carregando…' : produtos.length === 0 ? 'Nenhum material cadastrado. Use "Novo material" para começar.' : 'Nenhum material encontrado com esses filtros.'}
        >
          {filtrados.map(p => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className={`${celula} font-medium text-slate-900`}>{p.nome}</td>
              <td className={`${celula} text-slate-600`}>{p.categoria || '—'}</td>
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
  return (
    <>
      <CabecalhoPagina
        titulo="Retiradas"
        descricao="Requisições de material com comprovante"
        acoes={<Botao variante="primario" onClick={aoNova} icone={<Plus size={16} />}>Nova retirada</Botao>}
      />
      <Painel semPadding>
        <Tabela
          colunas={[{ titulo: 'Número' }, { titulo: 'Data' }, { titulo: 'Retirado por' }, { titulo: 'Setor' }, { titulo: 'Finalidade' }, { titulo: 'Itens', alinhar: 'direita' }, { titulo: '', largura: 'w-32' }]}
          vazio="Nenhuma retirada registrada."
        >
          {requisicoes.map(r => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{r.numero}</td>
              <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(r.criado_em)}</td>
              <td className={`${celula} font-medium`}>{r.retirado_por}</td>
              <td className={`${celula} text-slate-600`}>{r.setor || '—'}</td>
              <td className={`${celula} text-slate-600`}>{r.finalidade || '—'}{r.reserva_numero && <span className="ml-2"><Badge tom="azul">{r.reserva_numero}</Badge></span>}</td>
              <td className={celulaNumero}>{r.total_itens}</td>
              <td className={`${celula} text-right`}>
                <Botao variante="fantasma" onClick={() => aoComprovante(r.id)} icone={<FileText size={16} />}>Comprovante</Botao>
              </td>
            </tr>
          ))}
        </Tabela>
      </Painel>
    </>
  )
}

/* ------------------------------------------------------------------ reservas */

export function TelaReservas({ reservas, aoNova, aoAguardar, aoRetirar, aoLiberar }: {
  reservas: ReservaResumo[]
  aoNova: () => void
  aoAguardar: (r: ReservaResumo) => void
  aoRetirar: (r: ReservaResumo) => void
  aoLiberar: (r: ReservaResumo) => void
}) {
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false)
  const lista = mostrarEncerradas ? reservas : reservas.filter(r => r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA')

  return (
    <>
      <CabecalhoPagina
        titulo="Reservas"
        descricao="Pedidos separados aguardando retirada. O material reservado não pode ser usado em outras retiradas."
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
          colunas={[{ titulo: 'Número' }, { titulo: 'Data' }, { titulo: 'Finalidade' }, { titulo: 'Responsável' }, { titulo: 'Itens', alinhar: 'direita' }, { titulo: 'Status' }, { titulo: '', largura: 'w-72' }]}
          vazio={mostrarEncerradas ? 'Nenhuma reserva registrada.' : 'Nenhuma reserva aberta.'}
        >
          {lista.map(r => {
            const aberta = r.status === 'SEPARADO' || r.status === 'AGUARDANDO_RETIRADA'
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{r.numero}</td>
                <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(r.criado_em)}</td>
                <td className={`${celula} font-medium`}>{r.finalidade}</td>
                <td className={`${celula} text-slate-600`}>{r.reservado_por || '—'}</td>
                <td className={celulaNumero}>{r.total_itens}</td>
                <td className={celula}><StatusReserva status={r.status} /></td>
                <td className={`${celula} text-right`}>
                  {aberta && (
                    <div className="flex justify-end gap-1">
                      {r.status === 'SEPARADO' && <Botao variante="fantasma" onClick={() => aoAguardar(r)}>Marcar pronto</Botao>}
                      <Botao onClick={() => aoRetirar(r)} icone={<PackageCheck size={16} />}>Retirar</Botao>
                      <Botao variante="perigo" onClick={() => aoLiberar(r)}>Cancelar</Botao>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </Tabela>
      </Painel>
    </>
  )
}

/* ------------------------------------------------------------------ movimentações */

export function TelaMovimentacoes({ movs }: { movs: Movimentacao[] }) {
  const [tipo, setTipo] = useState('')
  const lista = tipo ? movs.filter(m => m.tipo === tipo) : movs
  return (
    <>
      <CabecalhoPagina titulo="Movimentações" descricao="Histórico de entradas e saídas (últimos 100 registros)" />
      <Painel semPadding>
        <div className="flex items-center gap-2 border-b border-slate-200 p-3">
          <select aria-label="Filtrar por tipo" value={tipo} onChange={e => setTipo(e.target.value)} className={classeCampo}>
            <option value="">Entradas e saídas</option>
            <option value="ENTRADA">Somente entradas</option>
            <option value="SAIDA">Somente saídas</option>
          </select>
        </div>
        <Tabela
          colunas={[{ titulo: 'Data' }, { titulo: 'Tipo' }, { titulo: 'Material' }, { titulo: 'Quantidade', alinhar: 'direita' }, { titulo: 'Origem' }, { titulo: 'Responsável' }, { titulo: 'Observação' }]}
          vazio="Nenhuma movimentação registrada."
        >
          {lista.map(m => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(m.criado_em)}</td>
              <td className={celula}>{m.tipo === 'ENTRADA' ? <Badge tom="verde">Entrada</Badge> : <Badge>Saída</Badge>}</td>
              <td className={`${celula} font-medium`}>{m.produto_nome}</td>
              <td className={celulaNumero}>{m.tipo === 'SAIDA' ? '−' : '+'}{formatarQtd(m.quantidade)} {m.unidade}</td>
              <td className={`${celula} text-slate-600`}>{ORIGEM[m.origem] || m.origem}</td>
              <td className={`${celula} text-slate-600`}>{m.responsavel || '—'}</td>
              <td className={`${celula} max-w-xs truncate text-slate-500`} title={m.observacao || ''}>{m.observacao || '—'}</td>
            </tr>
          ))}
        </Tabela>
      </Painel>
    </>
  )
}

/* ------------------------------------------------------------------ backup */

type ListaBackups = { pasta: string; backups: Array<{ nome: string; tamanho: number; criado_em: string }> }

const tamanho = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function TelaBackup({ aoRestaurar, notificar }: { aoRestaurar: () => void | Promise<void>; notificar: (msg: string, erro?: boolean) => void }) {
  const [lista, setLista] = useState<ListaBackups | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')

  const carregar = useCallback(async () => {
    try { setLista(await api<ListaBackups>('/api/backup')) } catch (e) { notificar(mensagemErro(e), true) }
  }, [notificar])
  useEffect(() => { carregar() }, [carregar])

  async function fazerBackup() {
    setOcupado(true)
    try {
      const r = await api<{ arquivo: string }>('/api/backup', { method: 'POST' })
      notificar(`Backup criado: ${r.arquivo}`)
      await carregar()
    } catch (e) {
      notificar(mensagemErro(e), true)
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar() {
    const selecionado = arquivo.current?.files?.[0]
    if (!selecionado) return notificar('Selecione um arquivo .db para restaurar', true)
    if (!window.confirm(`Substituir todos os dados atuais pelo backup "${selecionado.name}"?\n\nUma cópia dos dados atuais será salva antes.`)) return
    setOcupado(true)
    try {
      const form = new FormData()
      form.append('arquivo', selecionado)
      const r = await api<{ backupAnterior: string }>('/api/backup/restaurar', { method: 'POST', body: form })
      notificar(`Backup restaurado. Dados anteriores salvos em ${r.backupAnterior}`)
      if (arquivo.current) arquivo.current.value = ''
      setNomeArquivo('')
      await carregar()
      await aoRestaurar()
    } catch (e) {
      notificar(mensagemErro(e), true)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Backup"
        descricao="Um backup automático é criado por dia ao abrir o programa. Os 15 mais recentes são mantidos."
        acoes={<Botao variante="primario" onClick={fazerBackup} disabled={ocupado} icone={<HardDrive size={16} />}>Fazer backup agora</Botao>}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Painel titulo="Backups salvos" semPadding>
          {lista && <p className="break-all border-b border-slate-200 px-4 py-2 text-xs text-slate-500">Pasta: {lista.pasta}</p>}
          <Tabela colunas={[{ titulo: 'Arquivo' }, { titulo: 'Data' }, { titulo: 'Tamanho', alinhar: 'direita' }, { titulo: '', largura: 'w-40' }]} vazio="Nenhum backup ainda.">
            {(lista?.backups || []).map(b => (
              <tr key={b.nome} className="hover:bg-slate-50">
                <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{b.nome}</td>
                <td className={`${celula} whitespace-nowrap text-slate-600`}>{new Date(b.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className={`${celulaNumero} text-slate-600`}>{tamanho(b.tamanho)}</td>
                <td className={`${celula} text-right`}>
                  <a href={`/api/backup?arquivo=${encodeURIComponent(b.nome)}`} download={b.nome} className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                    <Download size={16} /> Salvar cópia
                  </a>
                </td>
              </tr>
            ))}
          </Tabela>
        </Painel>

        <Painel titulo="Restaurar backup">
          <div className="mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <p>Substitui todos os dados atuais. Antes, uma cópia dos dados atuais é salva automaticamente.</p>
          </div>
          <input ref={arquivo} id="arquivo-backup" type="file" accept=".db,.sqlite,application/octet-stream" className="sr-only" onChange={e => setNomeArquivo(e.target.files?.[0]?.name || '')} />
          <label htmlFor="arquivo-backup" className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
            <Upload size={16} /> <span className="truncate">{nomeArquivo || 'Escolher arquivo .db'}</span>
          </label>
          <Botao className="mt-3 w-full" onClick={restaurar} disabled={ocupado || !nomeArquivo}>Restaurar</Botao>
        </Painel>
      </div>
    </>
  )
}
