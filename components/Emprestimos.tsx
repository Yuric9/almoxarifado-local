'use client'
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Plus, Printer, Search, Undo2, Wrench, X } from 'lucide-react'
import { api, formatarData, formatarQtd, mensagemErro } from '@/lib/cliente'
import { dataBr, type Emprestimo, type EmprestimoDetalhe, type Produto } from '@/lib/tipos'
import { usePessoas } from './Formularios'
import { ItensMateriais, itensPreenchidos, linhaVazia, type LinhaItem } from './ItensMateriais'
import { usePode } from './Perfil'
import { SeletorFuncionario, type Pessoa } from './SeletorFuncionario'
import { AvisoErro, Badge, Botao, CabecalhoPagina, Campo, ModalFormulario, Painel, Tabela, celula, celulaNumero, classeCampo, classeInput, classeTextarea, useEnvio, useFecharComEsc } from './ui'

type Notificar = (msg: string, erro?: boolean) => void
type Filtro = 'abertos' | 'atrasados' | 'todos'

const p2 = (n: number) => String(n).padStart(2, '0')
const daquiA = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }

export function SituacaoEmprestimo({ e }: { e: Pick<Emprestimo, 'status' | 'atrasado'> }) {
  if (e.status === 'DEVOLVIDO') return <Badge tom="verde">Devolvido</Badge>
  return e.atrasado ? <Badge tom="vermelho">Atrasado</Badge> : <Badge tom="azul">Em aberto</Badge>
}

/** Ferramentas e equipamentos emprestados: com quem está, até quando e o que já voltou. */
export function TelaEmprestimos({ produtos, empresa, notificar, aoAlterarEstoque }: {
  produtos: Produto[]
  empresa?: string
  notificar: Notificar
  aoAlterarEstoque: () => Promise<void>
}) {
  const podeOperar = usePode('operacao')
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([])
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const [aberto, setAberto] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    try { setEmprestimos(await api<Emprestimo[]>('/api/emprestimos')) } catch (e) { notificar(mensagemErro(e), true) }
  }, [notificar])
  useEffect(() => { carregar() }, [carregar])

  async function aposMudanca(msg: string) {
    await Promise.all([carregar(), aoAlterarEstoque()])
    notificar(msg)
  }

  const contagem = {
    abertos: emprestimos.filter(e => e.status === 'ABERTO').length,
    atrasados: emprestimos.filter(e => e.atrasado).length,
    todos: emprestimos.length
  }
  const termo = busca.trim().toLocaleLowerCase('pt-BR')
  const lista = emprestimos
    .filter(e => filtro === 'todos' || (filtro === 'abertos' ? e.status === 'ABERTO' : e.atrasado))
    .filter(e => [e.numero, e.retirado_por, e.setor].some(v => v?.toLocaleLowerCase('pt-BR').includes(termo)))

  return (
    <>
      <CabecalhoPagina
        titulo="Empréstimos"
        descricao="Ferramentas e equipamentos que saem e voltam. Clique em um empréstimo para ver, imprimir o termo ou registrar a devolução."
        acoes={podeOperar && <Botao variante="primario" onClick={() => setNovo(true)} icone={<Plus size={16} />}>Novo empréstimo</Botao>}
      />
      <Painel semPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm" role="tablist" aria-label="Filtro">
            {([['abertos', 'Em aberto'], ['atrasados', 'Atrasados'], ['todos', 'Todos']] as const).map(([v, r]) => (
              <button key={v} role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}
                className={`rounded px-3 py-1 font-medium ${filtro === v ? (v === 'atrasados' ? 'bg-red-700 text-white' : 'bg-blue-700 text-white') : 'text-slate-600 hover:bg-slate-100'}`}>
                {r} <span className="ml-1 tabular-nums opacity-80">{contagem[v]}</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, pessoa ou setor" aria-label="Buscar empréstimo" className={`${classeCampo} w-full pl-8`} />
          </div>
        </div>
        <Tabela
          colunas={[{ titulo: 'Número' }, { titulo: 'Data' }, { titulo: 'Com quem' }, { titulo: 'Setor / obra' }, { titulo: 'Devolver até' }, { titulo: 'Pendente', alinhar: 'direita' }, { titulo: 'Situação' }]}
          vazio={emprestimos.length ? 'Nenhum empréstimo neste filtro.' : 'Nenhum empréstimo registrado. Use "Novo empréstimo".'}
        >
          {lista.map(e => (
            <tr key={e.id} onClick={() => setAberto(e.id)} className="cursor-pointer hover:bg-slate-50">
              <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{e.numero}</td>
              <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(e.criado_em)}</td>
              <td className={`${celula} font-medium`}>{e.retirado_por}</td>
              <td className={`${celula} text-slate-600`}>{e.setor || '—'}</td>
              <td className={`${celula} whitespace-nowrap ${e.atrasado ? 'font-semibold text-red-700' : 'text-slate-600'}`}>{e.previsao_devolucao ? dataBr(e.previsao_devolucao) : '—'}</td>
              <td className={celulaNumero}>{e.status === 'ABERTO' ? formatarQtd(e.pendente) : '—'}</td>
              <td className={celula}><SituacaoEmprestimo e={e} /></td>
            </tr>
          ))}
        </Tabela>
      </Painel>

      {novo && (
        <NovoEmprestimoModal produtos={produtos} aoFechar={() => setNovo(false)}
          aoConcluir={async id => { setNovo(false); await aposMudanca('Empréstimo registrado'); setAberto(id) }} />
      )}
      {aberto && <TermoEmprestimo id={aberto} empresa={empresa} aoFechar={() => setAberto(null)} aoDevolver={aposMudanca} />}
    </>
  )
}

function NovoEmprestimoModal({ produtos, aoFechar, aoConcluir }: { produtos: Produto[]; aoFechar: () => void; aoConcluir: (id: number) => Promise<void> }) {
  const { funcionarios, setores } = usePessoas()
  const [pessoa, setPessoa] = useState<Pessoa>({ funcionario_id: null, nome: '' })
  const [dados, setDados] = useState({ setor_id: '', previsao_devolucao: daquiA(7), observacao: '' })
  const [linhas, setLinhas] = useState<LinhaItem[]>([linhaVazia()])
  const { enviando, erro, executar } = useEnvio()

  function escolherPessoa(p: Pessoa) {
    setPessoa(p)
    const f = p.funcionario_id ? funcionarios.find(x => x.id === p.funcionario_id) : undefined
    if (f?.setor_id && setores.some(s => s.id === f.setor_id)) setDados(d => ({ ...d, setor_id: String(f.setor_id) }))
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const itens = itensPreenchidos(linhas)
      if (!itens.length) throw new Error('Adicione pelo menos um material com quantidade')
      const { id } = await api<{ id: number }>('/api/emprestimos', {
        method: 'POST',
        json: { ...dados, setor_id: dados.setor_id ? Number(dados.setor_id) : null, funcionario_id: pessoa.funcionario_id, retirado_por: pessoa.nome, itens }
      })
      await aoConcluir(id)
    })
  }

  return (
    <ModalFormulario titulo="Novo empréstimo" descricao="O material sai do estoque e volta quando for devolvido." aoFechar={aoFechar} largura="max-w-2xl" aoEnviar={enviar} rotuloEnviar="Registrar empréstimo" enviando={enviando}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Com quem vai ficar"><SeletorFuncionario funcionarios={funcionarios} valor={pessoa} aoMudar={escolherPessoa} autoFocus /></Campo>
        <Campo rotulo="Setor / obra" opcional>
          <select value={dados.setor_id} onChange={e => setDados({ ...dados, setor_id: e.target.value })} className={classeInput}>
            <option value="">{setores.length ? '— Não informado —' : 'Cadastre em Pessoas e setores'}</option>
            {setores.map(s => <option key={s.id} value={s.id}>{s.tipo === 'OBRA' ? 'Obra: ' : ''}{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Devolver até" opcional>
          <input type="date" value={dados.previsao_devolucao} onChange={e => setDados({ ...dados, previsao_devolucao: e.target.value })} className={classeInput} />
        </Campo>
      </div>
      <ItensMateriais produtos={produtos} linhas={linhas} aoMudar={setLinhas} avisoDisponivel="O restante está reservado, emprestado ou em falta." />
      <Campo rotulo="Observação" opcional>
        <textarea value={dados.observacao} onChange={e => setDados({ ...dados, observacao: e.target.value })} className={classeTextarea} placeholder="Ex.: furadeira com maleta e 2 brocas" />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/** Termo de empréstimo (para imprimir e assinar) e situação de cada item. */
function TermoEmprestimo({ id, empresa, aoFechar, aoDevolver }: { id: number; empresa?: string; aoFechar: () => void; aoDevolver: (msg: string) => Promise<void> }) {
  const dialogo = useId()
  const podeOperar = usePode('operacao')
  const [e, setE] = useState<EmprestimoDetalhe | null>(null)
  const [erro, setErro] = useState('')
  const [devolvendo, setDevolvendo] = useState(false)
  useFecharComEsc(dialogo, aoFechar)

  const carregar = useCallback(() => {
    api<EmprestimoDetalhe>(`/api/emprestimos/${id}`).then(setE).catch(x => setErro(mensagemErro(x)))
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  return (
    <div data-dialogo={dialogo} role="dialog" aria-label="Empréstimo" className="print-overlay fixed inset-0 z-50 flex flex-col items-center overflow-auto bg-black/50 p-4">
      <div className="mb-3 flex w-full max-w-[210mm] justify-end gap-2 print:hidden">
        {e?.status === 'ABERTO' && podeOperar && <Botao variante="primario" onClick={() => setDevolvendo(true)} icone={<Undo2 size={16} />}>Registrar devolução</Botao>}
        <span className="flex-1" />
        <Botao onClick={aoFechar} icone={<X size={16} />}>Fechar</Botao>
        <Botao onClick={() => window.print()} disabled={!e} icone={<Printer size={16} />}>Imprimir</Botao>
      </div>

      <article className="print-document w-full max-w-[210mm] bg-superficie px-10 py-9 text-sm text-slate-900 shadow-xl">
        {erro && <p className="text-red-700">{erro}</p>}
        {!e && !erro && <p className="py-10 text-center text-slate-500">Carregando…</p>}
        {e && (
          <>
            <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{[empresa, 'Almoxarifado'].filter(Boolean).join(' · ')}</p>
                <h2 className="mt-1 flex items-center gap-2 text-lg font-bold"><Wrench size={18} className="print:hidden" /> Termo de Empréstimo de Material</h2>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">Nº</p>
                <p className="font-mono text-base font-semibold">{e.numero}</p>
                <div className="mt-1"><SituacaoEmprestimo e={e} /></div>
              </div>
            </header>

            <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
              <Info rotulo="Data do empréstimo" valor={formatarData(e.criado_em)} />
              <Info rotulo="Devolver até" valor={e.previsao_devolucao ? dataBr(e.previsao_devolucao) : '—'} destaque={!!e.atrasado} />
              <Info rotulo="Com quem" valor={e.retirado_por} />
              <Info rotulo="Setor / obra" valor={e.setor || '—'} />
              {e.devolvido_em && <Info rotulo="Devolvido em" valor={formatarData(e.devolvido_em)} />}
            </dl>

            <table className="mt-6 w-full border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <th className="border-b border-slate-300 px-3 py-2">Material</th>
                  <th className="w-24 border-b border-slate-300 px-3 py-2 text-right">Emprestado</th>
                  <th className="w-24 border-b border-slate-300 px-3 py-2 text-right">Devolvido</th>
                  <th className="w-28 border-b border-slate-300 px-3 py-2 text-right">Não devolvido</th>
                  <th className="w-24 border-b border-slate-300 px-3 py-2 text-right">Pendente</th>
                </tr>
              </thead>
              <tbody>
                {e.itens.map(i => {
                  const pendente = i.quantidade - i.devolvida - i.nao_devolvida
                  return (
                    <tr key={i.id} className="border-b border-slate-200 last:border-0">
                      <td className="px-3 py-2">{i.produto_nome} <span className="text-xs text-slate-500">{i.unidade}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarQtd(i.quantidade)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{i.devolvida ? formatarQtd(i.devolvida) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-700">{i.nao_devolvida ? formatarQtd(i.nao_devolvida) : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{pendente > 0 ? formatarQtd(pendente) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {e.observacao && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Observação</p>
                <p className="mt-1">{e.observacao}</p>
              </div>
            )}

            <p className="mt-6 text-justify text-xs leading-relaxed text-slate-700">
              Declaro que recebi o material acima em perfeitas condições de uso, a título de empréstimo, e me comprometo a
              utilizá-lo somente no serviço, a zelar pela sua guarda e conservação e a devolvê-lo ao almoxarifado
              {e.previsao_devolucao ? ` até ${dataBr(e.previsao_devolucao)}` : ' quando solicitado'}, comunicando imediatamente qualquer perda ou dano.
            </p>

            <div className="mt-14 grid grid-cols-2 gap-12 text-center text-xs text-slate-600">
              <div className="border-t border-slate-400 pt-2">{e.retirado_por}<br />Recebedor</div>
              <div className="border-t border-slate-400 pt-2">{e.usuario_nome || ' '}<br />Responsável pelo almoxarifado</div>
            </div>
          </>
        )}
      </article>

      {devolvendo && e && (
        <DevolucaoModal emprestimo={e} aoFechar={() => setDevolvendo(false)}
          aoConcluir={async msg => { setDevolvendo(false); carregar(); await aoDevolver(msg) }} />
      )}
    </div>
  )
}

function Info({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className={`mt-0.5 font-medium ${destaque ? 'text-red-700' : ''}`}>{valor}{destaque ? ' (atrasado)' : ''}</dd>
    </div>
  )
}

function DevolucaoModal({ emprestimo, aoFechar, aoConcluir }: { emprestimo: EmprestimoDetalhe; aoFechar: () => void; aoConcluir: (msg: string) => Promise<void> }) {
  const pendentes = useMemo(() => emprestimo.itens.map(i => ({ ...i, pendente: Math.round((i.quantidade - i.devolvida - i.nao_devolvida) * 1000) / 1000 })).filter(i => i.pendente > 0), [emprestimo])
  const [qtd, setQtd] = useState<Record<number, { devolvida: string; nao_devolvida: string }>>(
    () => Object.fromEntries(pendentes.map(i => [i.id, { devolvida: String(i.pendente), nao_devolvida: '' }]))
  )
  const [observacao, setObservacao] = useState('')
  const { enviando, erro, executar } = useEnvio()
  const mudar = (id: number, campo: 'devolvida' | 'nao_devolvida', valor: string) => setQtd(q => ({ ...q, [id]: { ...q[id], [campo]: valor } }))

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    executar(async () => {
      const itens = pendentes.map(i => ({ item_id: i.id, devolvida: Number(qtd[i.id].devolvida || 0), nao_devolvida: Number(qtd[i.id].nao_devolvida || 0) }))
      const r = await api<EmprestimoDetalhe>(`/api/emprestimos/${emprestimo.id}`, { method: 'POST', json: { itens, observacao } })
      await aoConcluir(r.status === 'DEVOLVIDO' ? `Empréstimo ${emprestimo.numero} devolvido` : 'Devolução parcial registrada')
    })
  }

  return (
    <ModalFormulario titulo={`Devolução · ${emprestimo.numero}`} descricao={`Com ${emprestimo.retirado_por}. O que voltar entra no estoque. Use "Não devolvido" para o que foi perdido ou quebrou.`}
      aoFechar={aoFechar} largura="max-w-2xl" aoEnviar={enviar} rotuloEnviar="Confirmar devolução" enviando={enviando}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1">Material</th>
            <th className="w-24 py-1 text-right">Pendente</th>
            <th className="w-28 py-1 pl-3">Devolvido</th>
            <th className="w-28 py-1 pl-3">Não devolvido</th>
          </tr>
        </thead>
        <tbody>
          {pendentes.map(i => (
            <tr key={i.id} className="border-t border-slate-100">
              <td className="py-2">{i.produto_nome}</td>
              <td className="py-2 text-right tabular-nums">{formatarQtd(i.pendente)} {i.unidade}</td>
              <td className="py-2 pl-3"><input type="number" min="0" step="any" max={i.pendente} aria-label={`Devolvido: ${i.produto_nome}`} value={qtd[i.id].devolvida} onChange={e => mudar(i.id, 'devolvida', e.target.value)} className={`${classeInput} text-right`} /></td>
              <td className="py-2 pl-3"><input type="number" min="0" step="any" max={i.pendente} aria-label={`Não devolvido: ${i.produto_nome}`} value={qtd[i.id].nao_devolvida} onChange={e => mudar(i.id, 'nao_devolvida', e.target.value)} className={`${classeInput} text-right`} placeholder="0" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Campo rotulo="Observação" opcional>
        <input value={observacao} onChange={e => setObservacao(e.target.value)} className={classeInput} placeholder="Ex.: broca quebrada; maleta sem uma chave" />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}
