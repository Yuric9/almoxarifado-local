'use client'
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ClipboardList, FileCheck2, Play, Printer, Save, Search, X } from 'lucide-react'
import { api, formatarData, formatarQtd, mensagemErro } from '@/lib/cliente'
import type { CategoriaResumo, Inventario, InventarioDetalhe, ItemInventario } from '@/lib/tipos'
import { usePode } from './Perfil'
import { AvisoErro, Badge, Botao, CabecalhoPagina, Campo, ModalFormulario, Painel, Tabela, celula, celulaNumero, classeCampo, classeInput, useEnvio, useFecharComEsc } from './ui'

type Notificar = (msg: string, erro?: boolean) => void

const arred = (n: number) => Math.round(n * 1000) / 1000

function Situacao({ status }: { status: Inventario['status'] }) {
  if (status === 'ABERTO') return <Badge tom="azul">Em andamento</Badge>
  if (status === 'FINALIZADO') return <Badge tom="verde">Finalizado</Badge>
  return <Badge>Cancelado</Badge>
}

function Diferenca({ valor, unidade }: { valor: number; unidade?: string }) {
  if (!valor) return <span className="text-slate-400">0</span>
  return (
    <span className={`font-semibold ${valor > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
      {valor > 0 ? '+' : '−'}{formatarQtd(Math.abs(valor))}{unidade ? ` ${unidade}` : ''}
    </span>
  )
}

/** Inventário completo: contagem geral do estoque, com folha de contagem e ajuste de todas as diferenças. */
export function TelaInventario({ categorias, empresa, notificar, aoAlterarEstoque }: {
  categorias: CategoriaResumo[]
  empresa?: string
  notificar: Notificar
  aoAlterarEstoque: () => Promise<void>
}) {
  const podeOperar = usePode('operacao')
  const [lista, setLista] = useState<Inventario[]>([])
  const [aberto, setAberto] = useState<number | null>(null)
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    try { setLista(await api<Inventario[]>('/api/inventarios')) } catch (e) { notificar(mensagemErro(e), true) }
  }, [notificar])
  useEffect(() => { carregar() }, [carregar])

  if (aberto) {
    return (
      <InventarioView id={aberto} empresa={empresa} notificar={notificar}
        aoVoltar={() => { setAberto(null); carregar() }}
        aoFinalizar={async () => { await aoAlterarEstoque(); await carregar() }} />
    )
  }

  const andamento = lista.find(v => v.status === 'ABERTO')
  return (
    <>
      <CabecalhoPagina
        titulo="Inventário"
        descricao="Contagem geral do estoque: imprima a folha, lance o que foi contado e ajuste todas as diferenças de uma vez."
        acoes={podeOperar && !andamento && <Botao variante="primario" onClick={() => setNovo(true)} icone={<Play size={16} />}>Iniciar inventário</Botao>}
      />
      {andamento && (
        <button onClick={() => setAberto(andamento.id)}
          className="mb-4 flex w-full items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm text-blue-900 hover:bg-blue-100">
          <ClipboardList size={18} />
          <span><b>{andamento.numero}</b> em andamento · {andamento.escopo} · {andamento.contados} de {andamento.total_itens} contados</span>
          <span className="ml-auto font-medium">Continuar contagem ›</span>
        </button>
      )}
      <Painel semPadding>
        <Tabela
          colunas={[{ titulo: 'Número' }, { titulo: 'Início' }, { titulo: 'O que foi contado' }, { titulo: 'Contados', alinhar: 'direita' }, { titulo: 'Diferenças', alinhar: 'direita' }, { titulo: 'Situação' }]}
          vazio='Nenhum inventário feito ainda. Use "Iniciar inventário".'
        >
          {lista.map(v => (
            <tr key={v.id} onClick={() => setAberto(v.id)} className="cursor-pointer hover:bg-slate-50">
              <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{v.numero}</td>
              <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(v.criado_em)}</td>
              <td className={celula}>{v.descricao && <span className="font-medium">{v.descricao} · </span>}<span className="text-slate-600">{v.escopo}</span></td>
              <td className={celulaNumero}>{v.contados} / {v.total_itens}</td>
              <td className={`${celulaNumero} ${v.divergentes ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{v.divergentes}</td>
              <td className={celula}><Situacao status={v.status} /></td>
            </tr>
          ))}
        </Tabela>
      </Painel>
      {novo && (
        <NovoInventarioModal categorias={categorias} aoFechar={() => setNovo(false)}
          aoConcluir={async id => { setNovo(false); notificar('Inventário iniciado'); await carregar(); setAberto(id) }} />
      )}
    </>
  )
}

function NovoInventarioModal({ categorias, aoFechar, aoConcluir }: { categorias: CategoriaResumo[]; aoFechar: () => void; aoConcluir: (id: number) => Promise<void> }) {
  const [form, setForm] = useState({ descricao: '', categoria_id: '', localizacao: '', responsavel: '' })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const { id } = await api<{ id: number }>('/api/inventarios', { method: 'POST', json: { ...form, categoria_id: form.categoria_id ? Number(form.categoria_id) : null } })
      await aoConcluir(id)
    })
  }
  return (
    <ModalFormulario titulo="Iniciar inventário" aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar="Iniciar" enviando={enviando}
      descricao="O sistema guarda quanto tem de cada material agora. Depois é só lançar o que foi contado.">
      <Campo rotulo="Descrição" opcional><input autoFocus value={form.descricao} onChange={campo('descricao')} className={classeInput} placeholder="Ex.: Inventário de outubro" /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Categoria">
          <select value={form.categoria_id} onChange={campo('categoria_id')} className={classeInput}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Localização" opcional><input value={form.localizacao} onChange={campo('localizacao')} className={classeInput} placeholder="Ex.: Galpão A" /></Campo>
      </div>
      <Campo rotulo="Quem vai contar" opcional><input value={form.responsavel} onChange={campo('responsavel')} className={classeInput} /></Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

function InventarioView({ id, empresa, notificar, aoVoltar, aoFinalizar }: {
  id: number
  empresa?: string
  notificar: Notificar
  aoVoltar: () => void
  aoFinalizar: () => Promise<void>
}) {
  const podeOperar = usePode('operacao')
  const admin = usePode('admin')
  const [inv, setInv] = useState<InventarioDetalhe | null>(null)
  const [contagem, setContagem] = useState<Record<number, string>>({})
  const [cabecalho, setCabecalho] = useState({ responsavel: '', observacao: '' })
  const [alterado, setAlterado] = useState(false)
  const [busca, setBusca] = useState('')
  const [soFaltando, setSoFaltando] = useState(false)
  const [verSistema, setVerSistema] = useState(false)
  const [documento, setDocumento] = useState<'folha' | 'relatorio' | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const v = await api<InventarioDetalhe>(`/api/inventarios/${id}`)
      setInv(v)
      setContagem(Object.fromEntries(v.itens.map(i => [i.id, i.quantidade_contada === null ? '' : String(i.quantidade_contada)])))
      setCabecalho({ responsavel: v.responsavel || '', observacao: v.observacao || '' })
      setAlterado(false)
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }, [id, notificar])
  useEffect(() => { carregar() }, [carregar])

  const editavel = inv?.status === 'ABERTO' && podeOperar
  const contadoDe = (i: ItemInventario) => (contagem[i.id] === '' || contagem[i.id] === undefined ? null : Number(contagem[i.id]))

  const termo = busca.trim().toLocaleLowerCase('pt-BR')
  const visiveis = useMemo(() => (inv?.itens || [])
    .filter(i => !soFaltando || contadoDe(i) === null)
    .filter(i => [i.produto_nome, i.localizacao, i.categoria].some(v => v?.toLocaleLowerCase('pt-BR').includes(termo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [inv, contagem, soFaltando, termo])

  async function salvar(silencioso = false) {
    if (!inv) return
    setSalvando(true)
    try {
      await api(`/api/inventarios/${id}`, {
        method: 'PATCH',
        json: { ...cabecalho, contagens: inv.itens.map(i => ({ item_id: i.id, quantidade_contada: contagem[i.id] ?? '' })) }
      })
      setAlterado(false)
      if (!silencioso) notificar('Contagem salva')
      await carregar()
      return true
    } catch (e) {
      notificar(mensagemErro(e), true)
      return false
    } finally {
      setSalvando(false)
    }
  }

  async function cancelar() {
    if (!window.confirm('Cancelar este inventário? A contagem é descartada e o estoque não muda.')) return
    try {
      await api(`/api/inventarios/${id}`, { method: 'POST', json: { acao: 'cancelar' } })
      notificar('Inventário cancelado')
      aoVoltar()
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }

  if (!inv) return <p className="py-10 text-center text-sm text-slate-500">Carregando…</p>

  const contados = inv.itens.filter(i => contadoDe(i) !== null).length
  const finalizado = inv.status === 'FINALIZADO'
  const mostrarSistema = verSistema || inv.status !== 'ABERTO'

  return (
    <>
      <button onClick={aoVoltar} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ChevronLeft size={16} /> Inventários</button>
      <CabecalhoPagina
        titulo={`${inv.numero}${inv.descricao ? ` · ${inv.descricao}` : ''}`}
        descricao={`${inv.escopo} · iniciado em ${formatarData(inv.criado_em)}${inv.finalizado_em ? ` · ${finalizado ? 'finalizado' : 'cancelado'} em ${formatarData(inv.finalizado_em)}` : ''}`}
        acoes={
          <div className="flex flex-wrap gap-2">
            {inv.status === 'ABERTO' && <Botao onClick={() => setDocumento('folha')} icone={<Printer size={16} />}>Folha de contagem</Botao>}
            {finalizado && <Botao variante="primario" onClick={() => setDocumento('relatorio')} icone={<FileCheck2 size={16} />}>Relatório do inventário</Botao>}
            {editavel && <Botao onClick={() => salvar()} disabled={salvando} icone={<Save size={16} />}>{salvando ? 'Salvando…' : alterado ? 'Salvar contagem •' : 'Salvar contagem'}</Botao>}
            {inv.status === 'ABERTO' && admin && (
              <Botao variante="primario" onClick={async () => { if (!alterado || await salvar(true)) setConferindo(true) }} icone={<FileCheck2 size={16} />}>Conferir e finalizar</Botao>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo rotulo="Quem contou" className="w-64">
          <input value={cabecalho.responsavel} disabled={!editavel} onChange={e => { setCabecalho({ ...cabecalho, responsavel: e.target.value }); setAlterado(true) }} className={`${classeInput} disabled:bg-slate-50`} />
        </Campo>
        <Campo rotulo="Observação" opcional className="min-w-[240px] flex-1">
          <input value={cabecalho.observacao} disabled={!editavel} onChange={e => { setCabecalho({ ...cabecalho, observacao: e.target.value }); setAlterado(true) }} className={`${classeInput} disabled:bg-slate-50`} />
        </Campo>
        <div className="rounded-md border border-slate-200 bg-superficie px-4 py-2 text-sm">
          <span className="text-slate-500">Contados</span> <b className="tabular-nums">{contados} de {inv.itens.length}</b>
          <div className="mt-1 h-1.5 w-40 rounded bg-slate-100"><div className="h-1.5 rounded bg-blue-600" style={{ width: `${(contados / inv.itens.length) * 100}%` }} /></div>
        </div>
      </div>

      <Painel semPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por material, categoria ou localização" aria-label="Buscar no inventário" className={`${classeCampo} w-full pl-8`} />
          </div>
          {inv.status === 'ABERTO' && (
            <>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={soFaltando} onChange={e => setSoFaltando(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Só os não contados
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700" title="Deixe desligado para contar sem ser influenciado pelo número do sistema">
                <input type="checkbox" checked={verSistema} onChange={e => setVerSistema(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Mostrar estoque do sistema
              </label>
            </>
          )}
        </div>
        <Tabela
          colunas={[
            { titulo: 'Material' }, { titulo: 'Localização' }, { titulo: 'Un.' },
            ...(mostrarSistema ? [{ titulo: 'Sistema', alinhar: 'direita' as const }] : []),
            { titulo: 'Contado', alinhar: 'direita' as const, largura: 'w-36' },
            ...(mostrarSistema ? [{ titulo: finalizado ? 'Ajuste' : 'Diferença', alinhar: 'direita' as const }] : [])
          ]}
          vazio="Nenhum material neste filtro."
        >
          {visiveis.map(i => {
            const contado = contadoDe(i)
            const dif = contado === null ? null : arred(contado - i.quantidade_sistema)
            return (
              <tr key={i.id}>
                <td className={celula}>
                  <span className="font-medium text-slate-900">{i.produto_nome}</span>
                  {i.categoria && <span className="ml-2 text-xs text-slate-400">{i.categoria}</span>}
                  {i.movimentado ? <span className="ml-2" title="Teve entrada ou saída depois do início do inventário"><Badge tom="amarelo">mexeu no meio</Badge></span> : null}
                </td>
                <td className={`${celula} text-slate-600`}>{i.localizacao || '—'}</td>
                <td className={`${celula} text-slate-500`}>{i.unidade}</td>
                {mostrarSistema && <td className={`${celulaNumero} text-slate-500`}>{formatarQtd(i.quantidade_sistema)}</td>}
                <td className={`${celula} text-right`}>
                  {editavel ? (
                    <input type="number" min="0" step="any" inputMode="decimal" aria-label={`Contado: ${i.produto_nome}`} value={contagem[i.id] ?? ''}
                      onChange={e => { setContagem(c => ({ ...c, [i.id]: e.target.value })); setAlterado(true) }}
                      className={`${classeInput} w-28 text-right text-base font-semibold`} placeholder="—" />
                  ) : <span className="font-semibold tabular-nums">{contado === null ? '—' : formatarQtd(contado)}</span>}
                </td>
                {mostrarSistema && (
                  <td className={celulaNumero}>
                    {finalizado ? (i.ajuste ? <Diferenca valor={i.ajuste} /> : <span className="text-slate-400">—</span>) : dif === null ? <span className="text-slate-400">—</span> : <Diferenca valor={dif} />}
                  </td>
                )}
              </tr>
            )
          })}
        </Tabela>
      </Painel>
      {inv.status === 'ABERTO' && admin && (
        <div className="mt-4 flex justify-end">
          <button onClick={cancelar} className="text-sm text-red-700 hover:underline">Cancelar inventário</button>
        </div>
      )}

      {documento && <DocumentoInventario tipo={documento} inv={inv} empresa={empresa} aoFechar={() => setDocumento(null)} />}
      {conferindo && (
        <ConferenciaModal inv={inv} aoFechar={() => setConferindo(false)}
          aoConcluir={async msg => { setConferindo(false); notificar(msg); await carregar(); await aoFinalizar(); setDocumento('relatorio') }} />
      )}
    </>
  )
}

function ConferenciaModal({ inv, aoFechar, aoConcluir }: { inv: InventarioDetalhe; aoFechar: () => void; aoConcluir: (msg: string) => Promise<void> }) {
  const { enviando, erro, executar } = useEnvio()
  const contados = inv.itens.filter(i => i.quantidade_contada !== null)
  const divergentes = contados.filter(i => arred(i.quantidade_contada! - i.quantidade_sistema) !== 0)
  const naoContados = inv.itens.length - contados.length
  const mexeram = divergentes.filter(i => i.movimentado)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const r = await api<{ ajustados: number }>(`/api/inventarios/${inv.id}`, { method: 'POST', json: { acao: 'finalizar' } })
      await aoConcluir(r.ajustados ? `Inventário finalizado: ${r.ajustados} material(is) ajustado(s)` : 'Inventário finalizado sem diferenças')
    })
  }

  return (
    <ModalFormulario titulo={`Conferir ${inv.numero}`} aoFechar={aoFechar} aoEnviar={enviar} largura="max-w-2xl" enviando={enviando}
      rotuloEnviar={divergentes.length ? `Finalizar e ajustar ${divergentes.length} material(is)` : 'Finalizar inventário'}
      descricao="Confira as diferenças. Ao finalizar, cada uma vira um ajuste de inventário no estoque e o inventário não pode mais ser alterado.">
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-md border border-slate-200 px-3 py-2"><p className="text-2xl font-semibold tabular-nums">{contados.length}</p><p className="text-slate-500">contados</p></div>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-2xl font-semibold tabular-nums text-amber-800">{divergentes.length}</p><p className="text-amber-800">com diferença</p></div>
        <div className="rounded-md border border-slate-200 px-3 py-2"><p className="text-2xl font-semibold tabular-nums">{naoContados}</p><p className="text-slate-500">não contados (ficam como estão)</p></div>
      </div>
      {divergentes.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Material</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Diferença</th></tr>
            </thead>
            <tbody>
              {divergentes.map(i => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{i.produto_nome}{i.movimentado ? <span className="ml-1 text-amber-700">*</span> : null}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{formatarQtd(i.quantidade_sistema)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatarQtd(i.quantidade_contada!)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><Diferenca valor={arred(i.quantidade_contada! - i.quantidade_sistema)} unidade={i.unidade} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mexeram.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          * Teve entrada ou saída depois do início do inventário. O ajuste usa só a diferença da contagem, então essas movimentações são mantidas.
          Se a contagem foi feita depois delas, confira antes de finalizar.
        </p>
      )}
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/** Folha de contagem (em branco, sem o número do sistema) ou relatório final do inventário. */
function DocumentoInventario({ tipo, inv, empresa, aoFechar }: { tipo: 'folha' | 'relatorio'; inv: InventarioDetalhe; empresa?: string; aoFechar: () => void }) {
  const id = useId()
  useFecharComEsc(id, aoFechar)
  const relatorio = tipo === 'relatorio'
  const ajustados = inv.itens.filter(i => i.ajuste)
  const naoContados = inv.itens.filter(i => i.quantidade_contada === null)
  const linhas = relatorio ? ajustados : inv.itens
  const entradas = ajustados.filter(i => i.ajuste! > 0).length

  return (
    <div data-dialogo={id} role="dialog" aria-label={relatorio ? 'Relatório do inventário' : 'Folha de contagem'} className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/50 p-4">
      <div className="mb-3 flex w-full max-w-[210mm] justify-end gap-2 print:hidden">
        <Botao onClick={aoFechar} icone={<X size={16} />}>Fechar</Botao>
        <Botao variante="primario" onClick={() => window.print()} icone={<Printer size={16} />}>Imprimir</Botao>
      </div>
      <article className="print-document w-full max-w-[210mm] bg-superficie px-10 py-9 text-sm text-slate-900 shadow-xl">
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{[empresa, 'Almoxarifado'].filter(Boolean).join(' · ')}</p>
            <h2 className="mt-1 text-lg font-bold">{relatorio ? 'Relatório de Inventário' : 'Folha de Contagem de Inventário'}</h2>
            <p className="text-xs text-slate-500">{[inv.descricao, inv.escopo].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Nº</p>
            <p className="font-mono text-base font-semibold">{inv.numero}</p>
          </div>
        </header>

        <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs uppercase text-slate-500">Início</dt><dd>{formatarData(inv.criado_em)}</dd></div>
          {relatorio && <div><dt className="text-xs uppercase text-slate-500">Finalizado</dt><dd>{inv.finalizado_em ? formatarData(inv.finalizado_em) : '—'}</dd></div>}
          <div><dt className="text-xs uppercase text-slate-500">Contagem</dt><dd>{inv.responsavel || (relatorio ? '—' : '____________________')}</dd></div>
          {relatorio && <div><dt className="text-xs uppercase text-slate-500">Materiais contados</dt><dd>{inv.contados} de {inv.total_itens}</dd></div>}
          {relatorio && <div><dt className="text-xs uppercase text-slate-500">Ajustes</dt><dd>{ajustados.length} ({entradas} a mais · {ajustados.length - entradas} a menos)</dd></div>}
        </dl>

        {relatorio && <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Diferenças ajustadas</h3>}
        <table className={`${relatorio ? '' : 'mt-5'} w-full border border-slate-300`}>
          <thead>
            <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="w-8 border-b border-slate-300 px-2 py-2">#</th>
              <th className="border-b border-slate-300 px-2 py-2">Material</th>
              <th className="border-b border-slate-300 px-2 py-2">Localização</th>
              <th className="w-12 border-b border-slate-300 px-2 py-2">Un.</th>
              {relatorio ? (
                <>
                  <th className="w-20 border-b border-slate-300 px-2 py-2 text-right">Sistema</th>
                  <th className="w-20 border-b border-slate-300 px-2 py-2 text-right">Contado</th>
                  <th className="w-20 border-b border-slate-300 px-2 py-2 text-right">Ajuste</th>
                </>
              ) : <th className="w-32 border-b border-slate-300 px-2 py-2 text-right">Quantidade contada</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={7} className="px-3 py-5 text-center text-slate-500">Nenhuma diferença: o estoque bateu com a contagem.</td></tr>}
            {linhas.map((i, n) => (
              <tr key={i.id} className="border-b border-slate-200 last:border-0">
                <td className="px-2 py-2 text-slate-400">{n + 1}</td>
                <td className="px-2 py-2">{i.produto_nome}</td>
                <td className="px-2 py-2 text-slate-600">{i.localizacao || ''}</td>
                <td className="px-2 py-2">{i.unidade}</td>
                {relatorio ? (
                  <>
                    <td className="px-2 py-2 text-right tabular-nums">{formatarQtd(i.quantidade_sistema)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatarQtd(i.quantidade_contada ?? 0)}</td>
                    <td className="px-2 py-2 text-right tabular-nums"><Diferenca valor={i.ajuste ?? 0} /></td>
                  </>
                ) : <td className="px-2 py-2"><div className="ml-auto h-5 w-24 border-b border-slate-400" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {relatorio && naoContados.length > 0 && (
          <p className="mt-3 text-xs text-slate-600"><b>Não contados ({naoContados.length}):</b> {naoContados.map(i => i.produto_nome).join(', ')}. O estoque desses materiais não foi alterado.</p>
        )}
        {inv.observacao && relatorio && <p className="mt-3 text-xs"><b>Observação:</b> {inv.observacao}</p>}

        <div className="mt-14 grid grid-cols-2 gap-12 text-center text-xs text-slate-600">
          <div className="border-t border-slate-400 pt-2">{inv.responsavel || ' '}<br />Responsável pela contagem</div>
          <div className="border-t border-slate-400 pt-2">{relatorio ? inv.finalizado_por || ' ' : ' '}<br />{relatorio ? 'Responsável pelo almoxarifado' : 'Conferido por'}</div>
        </div>
      </article>
    </div>
  )
}
