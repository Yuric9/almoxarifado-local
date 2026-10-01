'use client'
import { useState, type FormEvent } from 'react'
import { api, formatarQtd } from '@/lib/cliente'
import type { Produto, ReservaDetalhe, ReservaResumo } from '@/lib/tipos'
import { ItensMateriais, itensPreenchidos, linhaVazia, type LinhaItem } from './ItensMateriais'
import { AvisoErro, Campo, ModalFormulario, classeInput, classeTextarea, useEnvio } from './ui'

type Base = { aoFechar: () => void; aoConcluir: (mensagem: string) => void | Promise<void> }

export function EntradaModal({ produtos, produtoInicial, aoFechar, aoConcluir }: Base & { produtos: Produto[]; produtoInicial?: number }) {
  const [produtoId, setProdutoId] = useState(produtoInicial ? String(produtoInicial) : '')
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
        <select autoFocus={!produtoInicial} value={produtoId} onChange={e => setProdutoId(e.target.value)} className={classeInput}>
          <option value="">Selecione…</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} · ` : ''}{p.nome}</option>)}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Quantidade">
          <input autoFocus={!!produtoInicial} type="number" min="0" step="any" inputMode="decimal" value={quantidade} onChange={e => setQuantidade(e.target.value)} className={classeInput} placeholder="0" />
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

export function RequisicaoModal({ produtos, entreguePorPadrao, aoFechar, aoConcluir }: Omit<Base, 'aoConcluir'> & {
  produtos: Produto[]
  entreguePorPadrao?: string
  aoConcluir: (id: number) => void | Promise<void>
}) {
  const [dados, setDados] = useState({ retirado_por: '', setor: '', finalidade: '', entregue_por: entreguePorPadrao || '', observacao: '' })
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

/** Cria uma reserva nova ou edita uma reserva aberta (quando `reserva` é informada). */
export function ReservaModal({ produtos, reserva, aoFechar, aoConcluir }: Base & { produtos: Produto[]; reserva?: ReservaDetalhe }) {
  const editando = !!reserva
  const [dados, setDados] = useState({
    finalidade: reserva?.finalidade || '',
    reservado_por: reserva?.reservado_por || '',
    observacao: reserva?.observacao || ''
  })
  const [linhas, setLinhas] = useState<LinhaItem[]>(
    reserva?.itens.length ? reserva.itens.map(i => ({ produto_id: String(i.produto_id), quantidade: String(i.quantidade) })) : [linhaVazia()]
  )
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof dados) => (e: { target: { value: string } }) => setDados({ ...dados, [nome]: e.target.value })

  // Ao editar, a quantidade já reservada por esta reserva volta a contar como disponível.
  const produtosDisponiveis = editando
    ? produtos.map(p => {
        const proprio = reserva.itens.filter(i => i.produto_id === p.id).reduce((t, i) => t + i.quantidade, 0)
        return proprio ? { ...p, quantidade_disponivel: p.quantidade_disponivel + proprio } : p
      })
    : produtos

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const itens = itensPreenchidos(linhas)
      if (!itens.length) throw new Error('Adicione pelo menos um material com quantidade')
      if (editando) {
        await api(`/api/reservas/${reserva.id}`, { method: 'PUT', json: { ...dados, itens } })
        await aoConcluir(`Reserva ${reserva.numero} atualizada`)
      } else {
        await api('/api/reservas', { method: 'POST', json: { ...dados, itens } })
        await aoConcluir('Reserva criada')
      }
    })
  }

  return (
    <ModalFormulario
      titulo={editando ? `Editar reserva ${reserva.numero}` : 'Nova reserva'}
      descricao="Separa materiais para um pedido. O estoque físico só é baixado na retirada."
      aoFechar={aoFechar}
      largura="max-w-2xl"
      aoEnviar={enviar}
      rotuloEnviar={editando ? 'Salvar alterações' : 'Criar reserva'}
      enviando={enviando}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Pedido / finalidade"><input autoFocus required value={dados.finalidade} onChange={campo('finalidade')} className={classeInput} placeholder="Ex.: Reforma da cozinha" /></Campo>
        <Campo rotulo="Responsável" opcional><input value={dados.reservado_por} onChange={campo('reservado_por')} className={classeInput} /></Campo>
      </div>
      <ItensMateriais produtos={produtosDisponiveis} linhas={linhas} aoMudar={setLinhas} avisoDisponivel="O restante já está reservado." />
      <Campo rotulo="Observação" opcional>
        <textarea value={dados.observacao} onChange={campo('observacao')} className={classeTextarea} />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/** Substitui o window.prompt(), que não funciona no Electron. */
export function RetirarReservaModal({ reserva, aoFechar, aoConcluir }: Omit<Base, 'aoConcluir'> & {
  reserva: Pick<ReservaResumo, 'id' | 'numero' | 'finalidade'>
  aoConcluir: (requisicaoId: number) => void | Promise<void>
}) {
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
