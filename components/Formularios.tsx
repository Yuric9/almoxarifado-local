'use client'
import { useState, type FormEvent } from 'react'
import { api, formatarQtd, mensagemErro } from '@/lib/cliente'
import { UNIDADES, type Categoria, type Produto, type ReservaResumo } from '@/lib/tipos'
import { ItensMateriais, itensPreenchidos, linhaVazia, type LinhaItem } from './ItensMateriais'
import { Acoes, Campo, Modal, classeInput } from './ui'

type Base = { aoFechar: () => void; aoConcluir: (mensagem: string) => void | Promise<void> }

/** Controla o estado "enviando" e mostra o erro dentro do formulário. */
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
  const Erro = () => (erro ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">{erro}</p> : null)
  return { enviando, executar, Erro }
}

export function EntradaModal({ produtos, aoFechar, aoConcluir }: Base & { produtos: Produto[] }) {
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const { enviando, executar, Erro } = useEnvio()

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      if (!produtoId) throw new Error('Selecione um material')
      if (!(Number(quantidade) > 0)) throw new Error('Informe uma quantidade maior que zero')
      await api('/api/movimentacoes', { method: 'POST', json: { produto_id: Number(produtoId), quantidade: Number(quantidade), observacao } })
      await aoConcluir('✅ Entrada registrada')
    })
  }

  return (
    <Modal titulo="⬇️ Entrada rápida" subtitulo="Informe o material e a quantidade. O estoque é atualizado na hora." aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Qual material?">
          <select autoFocus value={produtoId} onChange={e => setProdutoId(e.target.value)} className={classeInput}>
            <option value="">Selecione…</option>
            {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (tem {formatarQtd(p.quantidade_atual)} {p.unidade})</option>)}
          </select>
        </Campo>
        <Campo rotulo="Quantidade">
          <input type="number" min="0" step="any" inputMode="decimal" value={quantidade} onChange={e => setQuantidade(e.target.value)} className={classeInput} placeholder="Ex: 10" />
        </Campo>
        <Campo rotulo="Observação" opcional>
          <input value={observacao} onChange={e => setObservacao(e.target.value)} className={classeInput} placeholder="Ex: Compra para estoque" />
        </Campo>
        <Erro />
        <Acoes aoCancelar={aoFechar} rotuloConfirmar="Confirmar entrada" cor="bg-green-600 hover:bg-green-700" enviando={enviando} />
      </form>
    </Modal>
  )
}

export function NovoProdutoModal({ categorias, aoFechar, aoConcluir }: Base & { categorias: Categoria[] }) {
  const [form, setForm] = useState({ nome: '', categoria_id: '', unidade: 'UN', quantidade: '', minimo: '' })
  const { enviando, executar, Erro } = useEnvio()
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
      await aoConcluir('✅ Material cadastrado')
    })
  }

  return (
    <Modal titulo="+ Novo material" aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome do material">
          <input autoFocus required value={form.nome} onChange={campo('nome')} className={classeInput} placeholder="Ex: Fita isolante" />
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
          <Campo rotulo="Quantidade inicial">
            <input type="number" min="0" step="any" value={form.quantidade} onChange={campo('quantidade')} className={classeInput} placeholder="0" />
          </Campo>
          <Campo rotulo="Alerta abaixo de">
            <input type="number" min="0" step="any" value={form.minimo} onChange={campo('minimo')} className={classeInput} placeholder="5" />
          </Campo>
        </div>
        <Erro />
        <Acoes aoCancelar={aoFechar} rotuloConfirmar="Salvar" enviando={enviando} />
      </form>
    </Modal>
  )
}

export function RequisicaoModal({ produtos, aoFechar, aoConcluir }: Omit<Base, 'aoConcluir'> & { produtos: Produto[]; aoConcluir: (id: number) => void | Promise<void> }) {
  const [dados, setDados] = useState({ retirado_por: '', setor: '', finalidade: '', entregue_por: '', observacao: '' })
  const [linhas, setLinhas] = useState<LinhaItem[]>([linhaVazia()])
  const { enviando, executar, Erro } = useEnvio()
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
    <Modal titulo="📝 Requisição de material" subtitulo="Registre quem retirou e quais materiais foram entregues." aoFechar={aoFechar} largura="max-w-3xl">
      <form onSubmit={enviar}>
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <Campo rotulo="Quem retirou *"><input autoFocus required value={dados.retirado_por} onChange={campo('retirado_por')} className={classeInput} /></Campo>
          <Campo rotulo="Setor / departamento" opcional><input value={dados.setor} onChange={campo('setor')} className={classeInput} /></Campo>
          <Campo rotulo="Finalidade" opcional><input value={dados.finalidade} onChange={campo('finalidade')} className={classeInput} /></Campo>
          <Campo rotulo="Entregue por" opcional><input value={dados.entregue_por} onChange={campo('entregue_por')} className={classeInput} /></Campo>
        </div>
        <h3 className="mb-3 text-lg font-bold">Materiais retirados</h3>
        <ItensMateriais produtos={produtos} linhas={linhas} aoMudar={setLinhas} avisoDisponivel="estão disponíveis (o restante está reservado ou em falta)." />
        <textarea placeholder="Observação (opcional)" value={dados.observacao} onChange={campo('observacao')} className="mt-5 min-h-20 w-full rounded-xl border-2 border-zinc-200 p-3" />
        <Erro />
        <Acoes aoCancelar={aoFechar} rotuloConfirmar="Confirmar retirada" cor="bg-orange-600 hover:bg-orange-700" enviando={enviando} />
      </form>
    </Modal>
  )
}

export function ReservaModal({ produtos, aoFechar, aoConcluir }: Base & { produtos: Produto[] }) {
  const [dados, setDados] = useState({ finalidade: '', reservado_por: '', observacao: '' })
  const [linhas, setLinhas] = useState<LinhaItem[]>([linhaVazia()])
  const { enviando, executar, Erro } = useEnvio()
  const campo = (nome: keyof typeof dados) => (e: { target: { value: string } }) => setDados({ ...dados, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const itens = itensPreenchidos(linhas)
      if (!itens.length) throw new Error('Adicione pelo menos um material com quantidade')
      await api('/api/reservas', { method: 'POST', json: { ...dados, itens } })
      await aoConcluir('✅ Pedido separado e reservado')
    })
  }

  return (
    <Modal titulo="📦 Separar pedido" subtitulo="Os materiais ficam reservados (sem sair do estoque) até a retirada." aoFechar={aoFechar} largura="max-w-3xl">
      <form onSubmit={enviar}>
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <Campo rotulo="Pedido / finalidade *"><input autoFocus required value={dados.finalidade} onChange={campo('finalidade')} className={classeInput} placeholder="Ex: Reforma da cozinha" /></Campo>
          <Campo rotulo="Responsável" opcional><input value={dados.reservado_por} onChange={campo('reservado_por')} className={classeInput} /></Campo>
        </div>
        <h3 className="mb-3 text-lg font-bold">Materiais a separar</h3>
        <ItensMateriais produtos={produtos} linhas={linhas} aoMudar={setLinhas} avisoDisponivel="estão disponíveis para reserva." />
        <textarea placeholder="Observação (opcional)" value={dados.observacao} onChange={campo('observacao')} className="mt-5 min-h-20 w-full rounded-xl border-2 border-zinc-200 p-3" />
        <Erro />
        <Acoes aoCancelar={aoFechar} rotuloConfirmar="Confirmar separação" cor="bg-blue-600 hover:bg-blue-700" enviando={enviando} />
      </form>
    </Modal>
  )
}

/** Substitui o window.prompt(), que não funciona no Electron. */
export function RetirarReservaModal({ reserva, aoFechar, aoConcluir }: Omit<Base, 'aoConcluir'> & { reserva: ReservaResumo; aoConcluir: (requisicaoId: number) => void | Promise<void> }) {
  const [nome, setNome] = useState('')
  const { enviando, executar, Erro } = useEnvio()

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const { requisicao_id } = await api<{ requisicao_id: number }>(`/api/reservas/${reserva.id}`, { method: 'POST', json: { retirado_por: nome } })
      await aoConcluir(requisicao_id)
    })
  }

  return (
    <Modal titulo="Retirar pedido" subtitulo={`${reserva.numero} · ${reserva.finalidade}`} aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        <Campo rotulo="Quem está retirando?">
          <input autoFocus required value={nome} onChange={e => setNome(e.target.value)} className={classeInput} />
        </Campo>
        <Erro />
        <Acoes aoCancelar={aoFechar} rotuloConfirmar="Confirmar retirada" cor="bg-orange-600 hover:bg-orange-700" enviando={enviando} />
      </form>
    </Modal>
  )
}
