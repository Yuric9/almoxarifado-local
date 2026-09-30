'use client'
import { useState, type FormEvent } from 'react'
import { api, formatarQtd, mensagemErro } from '@/lib/cliente'
import { UNIDADES, type Categoria, type Produto, type ReservaResumo } from '@/lib/tipos'
import { ItensMateriais, itensPreenchidos, linhaVazia, type LinhaItem } from './ItensMateriais'
import { AvisoErro, Campo, ModalFormulario, classeInput } from './ui'

type Base = { aoFechar: () => void; aoConcluir: (mensagem: string) => void | Promise<void> }

const classeTextarea = 'min-h-[72px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20'

/** Controla o estado "enviando" e o erro exibido dentro do formulário. */
function useEnvio() {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  async function executar(acao: () => Promise<void>) {
    setEnviando(true)
    setErro('')
    try {
      await acao()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  }
  return { enviando, erro, executar }
}

export function EntradaModal({ produtos, aoFechar, aoConcluir }: Base & { produtos: Produto[] }) {
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const { enviando, erro, executar } = useEnvio()
  const selecionado = produtos.find(p => String(p.id) === produtoId)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      if (!produtoId) throw new Error('Selecione um material')
      if (!(Number(quantidade) > 0)) throw new Error('Informe uma quantidade maior que zero')
      await api('/api/movimentacoes', { method: 'POST', json: { produto_id: Number(produtoId), quantidade: Number(quantidade), observacao } })
      await aoConcluir('Entrada registrada')
    })
  }

  return (
    <ModalFormulario titulo="Registrar entrada" descricao="Soma a quantidade ao estoque do material." aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar="Registrar entrada" enviando={enviando}>
      <Campo rotulo="Material">
        <select autoFocus value={produtoId} onChange={e => setProdutoId(e.target.value)} className={classeInput}>
          <option value="">Selecione…</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Quantidade">
          <input type="number" min="0" step="any" inputMode="decimal" value={quantidade} onChange={e => setQuantidade(e.target.value)} className={classeInput} placeholder="0" />
        </Campo>
        <Campo rotulo="Estoque atual">
          <input readOnly tabIndex={-1} value={selecionado ? `${formatarQtd(selecionado.quantidade_atual)} ${selecionado.unidade}` : '—'} className={`${classeInput} bg-slate-50 text-slate-500`} />
        </Campo>
      </div>
      <Campo rotulo="Observação" opcional>
        <input value={observacao} onChange={e => setObservacao(e.target.value)} className={classeInput} placeholder="Ex.: compra, doação, devolução" />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

export function NovoProdutoModal({ categorias, aoFechar, aoConcluir }: Base & { categorias: Categoria[] }) {
  const [form, setForm] = useState({ nome: '', categoria_id: '', unidade: 'UN', quantidade: '', minimo: '' })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      await api('/api/produtos', {
        method: 'POST',
        json: {
          nome: form.nome,
          categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
          unidade: form.unidade,
          quantidade: form.quantidade === '' ? 0 : Number(form.quantidade),
          minimo: form.minimo === '' ? undefined : Number(form.minimo)
        }
      })
      await aoConcluir('Material cadastrado')
    })
  }

  return (
    <ModalFormulario titulo="Novo material" aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar="Cadastrar" enviando={enviando}>
      <Campo rotulo="Nome do material">
        <input autoFocus required value={form.nome} onChange={campo('nome')} className={classeInput} placeholder="Ex.: Fita isolante 19mm" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Categoria">
          <select value={form.categoria_id} onChange={campo('categoria_id')} className={classeInput}>
            <option value="">Sem categoria</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Unidade">
          <select value={form.unidade} onChange={campo('unidade')} className={classeInput}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Estoque inicial">
          <input type="number" min="0" step="any" value={form.quantidade} onChange={campo('quantidade')} className={classeInput} placeholder="0" />
        </Campo>
        <Campo rotulo="Estoque mínimo">
          <input type="number" min="0" step="any" value={form.minimo} onChange={campo('minimo')} className={classeInput} placeholder="5" />
        </Campo>
      </div>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

export function RequisicaoModal({ produtos, aoFechar, aoConcluir }: Omit<Base, 'aoConcluir'> & { produtos: Produto[]; aoConcluir: (id: number) => void | Promise<void> }) {
  const [dados, setDados] = useState({ retirado_por: '', setor: '', finalidade: '', entregue_por: '', observacao: '' })
  const [linhas, setLinhas] = useState<LinhaItem[]>([linhaVazia()])
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof dados) => (e: { target: { value: string } }) => setDados({ ...dados, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const itens = itensPreenchidos(linhas)
      if (!itens.length) throw new Error('Adicione pelo menos um material com quantidade')
      const { id } = await api<{ id: number }>('/api/requisicoes', { method: 'POST', json: { ...dados, itens } })
      await aoConcluir(id)
    })
  }

  return (
    <ModalFormulario titulo="Nova requisição de retirada" descricao="Baixa os materiais do estoque e gera o comprovante." aoFechar={aoFechar} largura="max-w-2xl" aoEnviar={enviar} rotuloEnviar="Registrar retirada" enviando={enviando}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Retirado por"><input autoFocus required value={dados.retirado_por} onChange={campo('retirado_por')} className={classeInput} /></Campo>
        <Campo rotulo="Setor" opcional><input value={dados.setor} onChange={campo('setor')} className={classeInput} /></Campo>
        <Campo rotulo="Finalidade" opcional><input value={dados.finalidade} onChange={campo('finalidade')} className={classeInput} /></Campo>
        <Campo rotulo="Entregue por" opcional><input value={dados.entregue_por} onChange={campo('entregue_por')} className={classeInput} /></Campo>
      </div>
      <ItensMateriais produtos={produtos} linhas={linhas} aoMudar={setLinhas} avisoDisponivel="O restante está reservado ou em falta." />
      <Campo rotulo="Observação" opcional>
        <textarea value={dados.observacao} onChange={campo('observacao')} className={classeTextarea} />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

export function ReservaModal({ produtos, aoFechar, aoConcluir }: Base & { produtos: Produto[] }) {
  const [dados, setDados] = useState({ finalidade: '', reservado_por: '', observacao: '' })
  const [linhas, setLinhas] = useState<LinhaItem[]>([linhaVazia()])
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof dados) => (e: { target: { value: string } }) => setDados({ ...dados, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const itens = itensPreenchidos(linhas)
      if (!itens.length) throw new Error('Adicione pelo menos um material com quantidade')
      await api('/api/reservas', { method: 'POST', json: { ...dados, itens } })
      await aoConcluir('Reserva criada')
    })
  }

  return (
    <ModalFormulario titulo="Nova reserva" descricao="Separa materiais para um pedido. O estoque físico só é baixado na retirada." aoFechar={aoFechar} largura="max-w-2xl" aoEnviar={enviar} rotuloEnviar="Criar reserva" enviando={enviando}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Pedido / finalidade"><input autoFocus required value={dados.finalidade} onChange={campo('finalidade')} className={classeInput} placeholder="Ex.: Reforma da cozinha" /></Campo>
        <Campo rotulo="Responsável" opcional><input value={dados.reservado_por} onChange={campo('reservado_por')} className={classeInput} /></Campo>
      </div>
      <ItensMateriais produtos={produtos} linhas={linhas} aoMudar={setLinhas} avisoDisponivel="O restante já está reservado." />
      <Campo rotulo="Observação" opcional>
        <textarea value={dados.observacao} onChange={campo('observacao')} className={classeTextarea} />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/** Substitui o window.prompt(), que não funciona no Electron. */
export function RetirarReservaModal({ reserva, aoFechar, aoConcluir }: Omit<Base, 'aoConcluir'> & { reserva: ReservaResumo; aoConcluir: (requisicaoId: number) => void | Promise<void> }) {
  const [nome, setNome] = useState('')
  const { enviando, erro, executar } = useEnvio()

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const { requisicao_id } = await api<{ requisicao_id: number }>(`/api/reservas/${reserva.id}`, { method: 'POST', json: { retirado_por: nome } })
      await aoConcluir(requisicao_id)
    })
  }

  return (
    <ModalFormulario titulo="Retirar reserva" descricao={`${reserva.numero} · ${reserva.finalidade}`} aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar="Confirmar retirada" enviando={enviando}>
      <Campo rotulo="Retirado por">
        <input autoFocus required value={nome} onChange={e => setNome(e.target.value)} className={classeInput} />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}
