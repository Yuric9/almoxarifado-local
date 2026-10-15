'use client'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { api, mensagemErro } from '@/lib/cliente'
import type { CategoriaResumo, ItemClassificacao, SugestaoCategoria } from '@/lib/tipos'
import { AvisoErro, Badge, Botao, Modal, classeInput, useEnvio } from './ui'

type Linha = ItemClassificacao & { incluir: boolean; categoria: string }

const CONFIANCA: Record<SugestaoCategoria['confianca'], { texto: string; tom: 'verde' | 'azul' | 'amarelo' }> = {
  alta: { texto: 'Alta', tom: 'verde' },
  media: { texto: 'Média', tom: 'azul' },
  baixa: { texto: 'Confira', tom: 'amarelo' }
}

type Filtro = 'todos' | 'baixa' | 'sem'

export function ClassificarModal({ categorias, aoFechar, aoConcluir }: {
  categorias: CategoriaResumo[]
  aoFechar: () => void
  aoConcluir: (mensagem: string) => Promise<void>
}) {
  const [todos, setTodos] = useState(false)
  const [fonte, setFonte] = useState('')
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [erroCarga, setErroCarga] = useState('')
  const gravacao = useEnvio()

  useEffect(() => {
    let ativo = true
    setLinhas(null)
    setErroCarga('')
    api<{ fonte: string; itens: ItemClassificacao[] }>(`/api/classificacao${todos ? '?todos=1' : ''}`)
      .then(r => {
        if (!ativo) return
        setFonte(r.fonte)
        setLinhas(r.itens.map(i => ({
          ...i,
          categoria: i.sugestao?.categoria ?? '',
          incluir: !!i.unidade_nova || (!!i.sugestao && i.sugestao.confianca !== 'baixa')
        })))
      })
      .catch(e => { if (ativo) setErroCarga(mensagemErro(e)) })
    return () => { ativo = false }
  }, [todos])

  const nomes = useMemo(() => {
    const lista = categorias.map(c => c.nome)
    for (const l of linhas ?? []) if (l.sugestao?.nova && !lista.includes(l.sugestao.categoria)) lista.push(l.sugestao.categoria)
    return lista.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [categorias, linhas])

  const novas = new Set(nomes.filter(n => !categorias.some(c => c.nome === n)))
  const atualizar = (id: number, dados: Partial<Linha>) => setLinhas(ls => ls && ls.map(l => (l.produto_id === id ? { ...l, ...dados } : l)))
  const visiveis = (linhas ?? []).filter(l => filtro === 'todos' || (filtro === 'sem' ? !l.sugestao : l.sugestao?.confianca === 'baixa'))
  const selecionadas = (linhas ?? []).filter(l => l.incluir && (l.categoria || l.unidade_nova))
  const contagem = (c: SugestaoCategoria['confianca'] | null) => (linhas ?? []).filter(l => (c ? l.sugestao?.confianca === c : !l.sugestao)).length

  function aplicar() {
    gravacao.executar(async () => {
      if (!selecionadas.length) throw new Error('Marque pelo menos um material com categoria')
      const r = await api<{ atualizados: number; categorias_criadas: number }>('/api/classificacao', {
        method: 'POST',
        json: { itens: selecionadas.map(l => ({ produto_id: l.produto_id, categoria: l.categoria || null, unidade: l.unidade_nova })) }
      })
      await aoConcluir(`${r.atualizados} material(is) classificado(s)${r.categorias_criadas ? ` · ${r.categorias_criadas} categoria(s) criada(s)` : ''}`)
    })
  }

  return (
    <Modal titulo="Classificar materiais" aoFechar={aoFechar} largura="max-w-6xl">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          O sistema sugere a categoria pelo nome do material, comparando com os materiais que você já classificou e com a tabela de referência
          {fonte ? <> (<span className="text-slate-500">{fonte}</span>)</> : null}. Confira e desmarque o que não estiver certo antes de aplicar.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Revisar também os que já têm categoria
          </label>
          {linhas && (
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Mostrar">
              {([['todos', `Todos (${linhas.length})`], ['baixa', `Para conferir (${contagem('baixa')})`], ['sem', `Sem sugestão (${contagem(null)})`]] as Array<[Filtro, string]>).map(([valor, rotulo]) => (
                <button key={valor} type="button" role="radio" aria-checked={filtro === valor} onClick={() => setFiltro(valor)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${filtro === valor ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {rotulo}
                </button>
              ))}
            </div>
          )}
          {linhas && <span className="ml-auto text-xs text-slate-500">{contagem('alta')} alta · {contagem('media')} média · {contagem('baixa')} para conferir</span>}
        </div>

        <AvisoErro texto={erroCarga} />

        <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" aria-label="Marcar todos os visíveis" className="h-4 w-4"
                    checked={visiveis.length > 0 && visiveis.every(l => l.incluir)}
                    onChange={e => { const ids = new Set(visiveis.map(l => l.produto_id)); setLinhas(ls => ls && ls.map(l => (ids.has(l.produto_id) ? { ...l, incluir: e.target.checked } : l))) }} />
                </th>
                <th className="px-2 py-2">Material</th>
                <th className="w-32 px-2 py-2">Un.</th>
                <th className="w-56 px-2 py-2">Categoria</th>
                <th className="px-2 py-2">Por quê</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!linhas && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">{erroCarga ? '' : 'Analisando os materiais…'}</td></tr>}
              {linhas && !visiveis.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">{linhas.length ? 'Nada neste filtro.' : 'Todos os materiais já estão classificados.'}</td></tr>}
              {visiveis.map(l => (
                <tr key={l.produto_id} className={l.incluir ? '' : 'opacity-60'}>
                  <td className="px-3 py-1.5 align-top">
                    <input type="checkbox" aria-label={`Aplicar em ${l.nome}`} checked={l.incluir} onChange={e => atualizar(l.produto_id, { incluir: e.target.checked })} className="mt-2 h-4 w-4" />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <p className="pt-1.5 font-medium text-slate-900">{l.nome}</p>
                    {l.categoria_atual && <p className="text-xs text-slate-500">Hoje: {l.categoria_atual}</p>}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {l.unidade_nova
                      ? <p className="flex flex-wrap items-center gap-1 pt-1.5 text-xs"><span className="text-slate-400 line-through">{l.unidade_atual}</span><ArrowRight size={12} className="text-slate-400" /><b className="text-slate-900">{l.unidade_nova}</b></p>
                      : <p className="pt-1.5 text-slate-500">{l.unidade_atual}</p>}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <select aria-label={`Categoria de ${l.nome}`} value={l.categoria} onChange={e => atualizar(l.produto_id, { categoria: e.target.value, incluir: !!e.target.value || !!l.unidade_nova })} className={`${classeInput} h-8`}>
                      <option value="">{l.categoria_atual ? 'Manter a atual' : '— Escolha —'}</option>
                      {nomes.map(n => <option key={n} value={n}>{n}{novas.has(n) ? ' (nova)' : ''}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 align-top text-xs text-slate-600">
                    {l.sugestao ? (
                      <div className="flex items-start gap-2 pt-1">
                        <Badge tom={CONFIANCA[l.sugestao.confianca].tom}>{CONFIANCA[l.sugestao.confianca].texto}</Badge>
                        <span>{l.sugestao.detalhe}</span>
                      </div>
                    ) : <p className="pt-1.5 text-slate-400">{l.unidade_nova ? 'Só a unidade será corrigida' : 'Sem sugestão: escolha a categoria'}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AvisoErro texto={gravacao.erro} />

        <div className="-mx-5 -mb-4 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-500">Os marcados como “Confira” vêm desmarcados. Categorias marcadas como “(nova)” serão criadas.</span>
          <span className="ml-auto text-xs text-slate-500">{selecionadas.length} selecionado(s)</span>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={aplicar} disabled={gravacao.enviando || !selecionadas.length}>
            {gravacao.enviando ? 'Aplicando…' : `Aplicar em ${selecionadas.length}`}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
