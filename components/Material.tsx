'use client'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ClipboardCheck, PackageMinus, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { api, formatarData, formatarQtd, mensagemErro } from '@/lib/cliente'
import { MOTIVOS_BAIXA, UNIDADES, descreverOrigem, type CategoriaResumo, type Produto, type ProdutoFicha } from '@/lib/tipos'
import { EntradaModal } from './Formularios'
import { AvisoErro, Badge, Botao, Campo, Modal, ModalFormulario, Tabela, celula, celulaNumero, classeInput, useEnvio } from './ui'

type AoConcluir = (mensagem: string) => void | Promise<void>

/* ------------------------------------------------------------------ cadastro / edição */

export function MaterialFormModal({ produto, categorias, aoFechar, aoConcluir, aoCriarCategoria }: {
  produto?: Produto
  categorias: CategoriaResumo[]
  aoFechar: () => void
  aoConcluir: AoConcluir
  aoCriarCategoria: () => Promise<void>
}) {
  const editando = !!produto
  const [form, setForm] = useState({
    nome: produto?.nome || '',
    codigo: produto?.codigo || '',
    categoria_id: produto?.categoria_id ? String(produto.categoria_id) : '',
    unidade: produto?.unidade || 'UN',
    localizacao: produto?.localizacao || '',
    quantidade: '',
    minimo: produto ? String(produto.estoque_minimo) : ''
  })
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null)
  const { enviando, erro, setErro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })
  const unidades = UNIDADES.includes(form.unidade as (typeof UNIDADES)[number]) ? UNIDADES : [form.unidade, ...UNIDADES]

  async function salvarCategoria() {
    try {
      const { id } = await api<{ id: number }>('/api/categorias', { method: 'POST', json: { nome: novaCategoria } })
      await aoCriarCategoria()
      setForm(f => ({ ...f, categoria_id: String(id) }))
      setNovaCategoria(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const dados = {
        nome: form.nome,
        codigo: form.codigo,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        unidade: form.unidade,
        localizacao: form.localizacao,
        minimo: form.minimo === '' ? undefined : Number(form.minimo)
      }
      if (editando) {
        await api(`/api/produtos/${produto.id}`, { method: 'PATCH', json: dados })
        await aoConcluir('Material atualizado')
      } else {
        await api('/api/produtos', { method: 'POST', json: { ...dados, quantidade: form.quantidade === '' ? 0 : Number(form.quantidade) } })
        await aoConcluir('Material cadastrado')
      }
    })
  }

  return (
    <ModalFormulario titulo={editando ? 'Editar material' : 'Novo material'} aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar={editando ? 'Salvar alterações' : 'Cadastrar'} enviando={enviando}>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <Campo rotulo="Nome do material">
          <input autoFocus required value={form.nome} onChange={campo('nome')} className={classeInput} placeholder="Ex.: Fita isolante 19mm" />
        </Campo>
        <Campo rotulo="Código" opcional>
          <input value={form.codigo} onChange={campo('codigo')} className={classeInput} placeholder="MAT-001" />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Campo rotulo="Categoria">
            <select value={form.categoria_id} onChange={campo('categoria_id')} className={classeInput}>
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          {novaCategoria === null ? (
            <button type="button" onClick={() => setNovaCategoria('')} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              <Plus size={12} /> Nova categoria
            </button>
          ) : (
            <div className="mt-1 flex gap-1">
              <input autoFocus value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Nome da categoria" aria-label="Nome da nova categoria" className={`${classeInput} h-8`}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salvarCategoria() } if (e.key === 'Escape') { e.stopPropagation(); setNovaCategoria(null) } }} />
              <Botao className="h-8" onClick={salvarCategoria}>Criar</Botao>
            </div>
          )}
        </div>
        <Campo rotulo="Unidade">
          <select value={form.unidade} onChange={campo('unidade')} className={classeInput}>
            {unidades.map(u => <option key={u}>{u}</option>)}
          </select>
        </Campo>
        {!editando && (
          <Campo rotulo="Estoque inicial">
            <input type="number" min="0" step="any" value={form.quantidade} onChange={campo('quantidade')} className={classeInput} placeholder="0" />
          </Campo>
        )}
        <Campo rotulo="Estoque mínimo">
          <input type="number" min="0" step="any" value={form.minimo} onChange={campo('minimo')} className={classeInput} placeholder="Padrão das configurações" />
        </Campo>
        <Campo rotulo="Localização" opcional className={editando ? '' : 'col-span-2'}>
          <input value={form.localizacao} onChange={campo('localizacao')} className={classeInput} placeholder="Ex.: Corredor 2, prateleira B" />
        </Campo>
      </div>
      {editando && <p className="text-xs text-slate-500">A quantidade em estoque não é alterada aqui. Use “Ajustar estoque” para corrigir o saldo.</p>}
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/* ------------------------------------------------------------------ baixa */

export function BaixaModal({ produtos, produtoInicial, aoFechar, aoConcluir }: {
  produtos: Produto[]
  produtoInicial?: number
  aoFechar: () => void
  aoConcluir: AoConcluir
}) {
  const [form, setForm] = useState({ produto_id: produtoInicial ? String(produtoInicial) : '', quantidade: '', motivo: '', responsavel: '', observacao: '' })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })
  const p = produtos.find(x => String(x.id) === form.produto_id)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      if (!form.produto_id) throw new Error('Selecione um material')
      await api(`/api/produtos/${form.produto_id}/baixa`, { method: 'POST', json: { ...form, quantidade: Number(form.quantidade) } })
      await aoConcluir('Baixa registrada')
    })
  }

  return (
    <ModalFormulario titulo="Dar baixa" descricao="Retira do estoque material perdido, furtado, vencido ou danificado." aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar="Registrar baixa" enviando={enviando}>
      <Campo rotulo="Material">
        <select value={form.produto_id} onChange={campo('produto_id')} className={classeInput}>
          <option value="">Selecione…</option>
          {produtos.map(x => <option key={x.id} value={x.id}>{x.nome} (disp. {formatarQtd(x.quantidade_disponivel)} {x.unidade})</option>)}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Motivo">
          <select required value={form.motivo} onChange={campo('motivo')} className={classeInput}>
            <option value="">Selecione…</option>
            {Object.entries(MOTIVOS_BAIXA).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo={`Quantidade${p ? ` (${p.unidade})` : ''}`}>
          <input type="number" min="0" step="any" required value={form.quantidade} onChange={campo('quantidade')} className={classeInput} placeholder="0" />
        </Campo>
      </div>
      <Campo rotulo="Responsável" opcional><input value={form.responsavel} onChange={campo('responsavel')} className={classeInput} /></Campo>
      <Campo rotulo="Observação" opcional={form.motivo !== 'OUTRO'}>
        <input value={form.observacao} onChange={campo('observacao')} className={classeInput} placeholder="Ex.: caixa molhada na chuva, lote 2025/08" />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/* ------------------------------------------------------------------ ajuste */

export function AjusteModal({ produto, aoFechar, aoConcluir }: { produto: Produto; aoFechar: () => void; aoConcluir: AoConcluir }) {
  const [form, setForm] = useState({ quantidade_contada: '', responsavel: '', observacao: '' })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })
  const diferenca = form.quantidade_contada === '' ? null : Number(form.quantidade_contada) - produto.quantidade_atual

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      await api(`/api/produtos/${produto.id}/ajuste`, { method: 'POST', json: { ...form, quantidade_contada: form.quantidade_contada === '' ? '' : Number(form.quantidade_contada) } })
      await aoConcluir('Estoque ajustado')
    })
  }

  return (
    <ModalFormulario titulo="Ajustar estoque" descricao={`${produto.nome} · contagem física (inventário)`} aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar="Ajustar" enviando={enviando}>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Estoque no sistema">
          <input readOnly tabIndex={-1} value={`${formatarQtd(produto.quantidade_atual)} ${produto.unidade}`} className={`${classeInput} bg-slate-50 text-slate-500`} />
        </Campo>
        <Campo rotulo="Quantidade contada">
          <input autoFocus type="number" min="0" step="any" required value={form.quantidade_contada} onChange={campo('quantidade_contada')} className={classeInput} />
        </Campo>
      </div>
      {diferenca !== null && Number.isFinite(diferenca) && diferenca !== 0 && (
        <p className="text-sm text-slate-600">
          Será lançado um ajuste de <b className={diferenca > 0 ? 'text-emerald-700' : 'text-red-700'}>{diferenca > 0 ? '+' : '−'}{formatarQtd(Math.abs(diferenca))} {produto.unidade}</b>.
        </p>
      )}
      <Campo rotulo="Responsável" opcional><input value={form.responsavel} onChange={campo('responsavel')} className={classeInput} /></Campo>
      <Campo rotulo="Observação" opcional><input value={form.observacao} onChange={campo('observacao')} className={classeInput} placeholder="Ex.: inventário mensal" /></Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/* ------------------------------------------------------------------ ficha */

type Acao = 'entrada' | 'baixa' | 'ajuste' | 'editar' | null

export function FichaMaterial({ produtoId, produtos, categorias, aoFechar, aoAlterar, aoCriarCategoria, abrirComprovante, abrirReserva }: {
  produtoId: number
  produtos: Produto[]
  categorias: CategoriaResumo[]
  aoFechar: () => void
  aoAlterar: (mensagem: string) => Promise<void>
  aoCriarCategoria: () => Promise<void>
  abrirComprovante: (requisicaoId: number) => void
  abrirReserva: (reservaId: number) => void
}) {
  const [ficha, setFicha] = useState<ProdutoFicha | null>(null)
  const [acao, setAcao] = useState<Acao>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try {
      setFicha(await api<ProdutoFicha>(`/api/produtos/${produtoId}`))
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [produtoId])
  useEffect(() => { carregar() }, [carregar])

  async function concluir(mensagem: string) {
    setAcao(null)
    await Promise.all([carregar(), aoAlterar(mensagem)])
  }

  async function alternarAtivo() {
    if (!ficha) return
    try {
      setErro('')
      await api(`/api/produtos/${ficha.id}`, { method: 'PATCH', json: { ativo: !ficha.ativo } })
      await concluir(ficha.ativo ? 'Material inativado' : 'Material reativado')
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }

  async function excluir() {
    if (!ficha || !window.confirm(`Excluir o material "${ficha.nome}"? Esta ação não pode ser desfeita.`)) return
    try {
      setErro('')
      await api(`/api/produtos/${ficha.id}`, { method: 'DELETE' })
      await aoAlterar('Material excluído')
      aoFechar()
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }

  const fecharAcao = () => setAcao(null)

  return (
    <>
      <Modal titulo={ficha?.nome || 'Material'} descricao={ficha ? [ficha.codigo, ficha.categoria || 'Sem categoria', ficha.localizacao].filter(Boolean).join(' · ') : undefined} aoFechar={aoFechar} largura="max-w-4xl">
        {!ficha ? <p className="py-6 text-center text-sm text-slate-500">{erro || 'Carregando…'}</p> : (
          <div className="space-y-5">
            {!ficha.ativo && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Material inativo: não aparece nas listas de entrada, retirada e reserva.</p>}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="Estoque físico" valor={`${formatarQtd(ficha.quantidade_atual)} ${ficha.unidade}`} />
              <Numero rotulo="Reservado" valor={`${formatarQtd(ficha.quantidade_reservada)} ${ficha.unidade}`} />
              <Numero rotulo="Disponível" valor={`${formatarQtd(ficha.quantidade_disponivel)} ${ficha.unidade}`} destaque />
              <Numero rotulo="Estoque mínimo" valor={`${formatarQtd(ficha.estoque_minimo)} ${ficha.unidade}`} alerta={ficha.quantidade_atual <= ficha.estoque_minimo} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Botao disabled={!ficha.ativo} onClick={() => setAcao('entrada')} icone={<ArrowDownToLine size={16} />}>Entrada</Botao>
              <Botao disabled={!ficha.ativo} onClick={() => setAcao('baixa')} icone={<PackageMinus size={16} />}>Dar baixa</Botao>
              <Botao disabled={!ficha.ativo} onClick={() => setAcao('ajuste')} icone={<ClipboardCheck size={16} />}>Ajustar estoque</Botao>
              <Botao onClick={() => setAcao('editar')} icone={<Pencil size={16} />}>Editar</Botao>
              <span className="flex-1" />
              <Botao variante="fantasma" onClick={alternarAtivo} icone={<Power size={16} />}>{ficha.ativo ? 'Inativar' : 'Reativar'}</Botao>
              <Botao variante="perigo" onClick={excluir} icone={<Trash2 size={16} />}>Excluir</Botao>
            </div>
            <AvisoErro texto={erro} />

            {ficha.reservas.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Reservas abertas</h3>
                <div className="rounded-md border border-slate-200">
                  <Tabela colunas={[{ titulo: 'Reserva' }, { titulo: 'Finalidade' }, { titulo: 'Quantidade', alinhar: 'direita' }]}>
                    {ficha.reservas.map(r => (
                      <tr key={r.id} onClick={() => abrirReserva(r.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className={`${celula} whitespace-nowrap font-mono text-xs`}>{r.numero}</td>
                        <td className={celula}>{r.finalidade}</td>
                        <td className={celulaNumero}>{formatarQtd(r.quantidade)} {ficha.unidade}</td>
                      </tr>
                    ))}
                  </Tabela>
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Histórico</h3>
              <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
                <Tabela colunas={[{ titulo: 'Data' }, { titulo: 'Movimento' }, { titulo: 'Quantidade', alinhar: 'direita' }, { titulo: 'Responsável' }, { titulo: 'Observação' }]} vazio="Sem movimentações.">
                  {ficha.movimentacoes.map(m => (
                    <tr key={m.id} onClick={m.requisicao_id ? () => abrirComprovante(m.requisicao_id!) : undefined} className={m.requisicao_id ? 'cursor-pointer hover:bg-slate-50' : ''}>
                      <td className={`${celula} whitespace-nowrap text-slate-600`}>{formatarData(m.criado_em)}</td>
                      <td className={celula}><Badge tom={m.origem === 'BAIXA' ? 'vermelho' : m.tipo === 'ENTRADA' ? 'verde' : 'neutro'}>{descreverOrigem(m)}</Badge></td>
                      <td className={`${celulaNumero} whitespace-nowrap`}>{m.tipo === 'SAIDA' ? '−' : '+'}{formatarQtd(m.quantidade)}</td>
                      <td className={`${celula} text-slate-600`}>{m.responsavel || '—'}</td>
                      <td className={`${celula} max-w-xs truncate text-slate-500`} title={m.observacao || ''}>{m.observacao || '—'}</td>
                    </tr>
                  ))}
                </Tabela>
              </div>
            </section>
          </div>
        )}
      </Modal>

      {ficha && acao === 'entrada' && <EntradaModal produtos={produtos} produtoInicial={ficha.id} aoFechar={fecharAcao} aoConcluir={concluir} />}
      {ficha && acao === 'baixa' && <BaixaModal produtos={produtos} produtoInicial={ficha.id} aoFechar={fecharAcao} aoConcluir={concluir} />}
      {ficha && acao === 'ajuste' && <AjusteModal produto={ficha} aoFechar={fecharAcao} aoConcluir={concluir} />}
      {ficha && acao === 'editar' && <MaterialFormModal produto={ficha} categorias={categorias} aoFechar={fecharAcao} aoConcluir={concluir} aoCriarCategoria={aoCriarCategoria} />}
    </>
  )
}

function Numero({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${alerta ? 'text-amber-700' : destaque ? 'text-slate-900' : 'text-slate-700'}`}>{valor}</p>
    </div>
  )
}
