'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { api, formatarQtd } from '@/lib/cliente'
import type { Funcionario, Produto, ReservaDetalhe, ReservaResumo, Setor } from '@/lib/tipos'
import { ItensMateriais, itensPreenchidos, linhaVazia, type LinhaItem } from './ItensMateriais'
import { SeletorFuncionario, type Pessoa } from './SeletorFuncionario'
import { SeletorMaterial } from './SeletorMaterial'
import { AvisoErro, Campo, ModalFormulario, classeInput, classeTextarea, useEnvio } from './ui'

type Base = { aoFechar: () => void; aoConcluir: (mensagem: string) => void | Promise<void> }

/** Funcionários e setores cadastrados, para a retirada. */
function usePessoas() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  useEffect(() => {
    api<Funcionario[]>('/api/funcionarios').then(setFuncionarios).catch(() => {})
    api<Setor[]>('/api/setores').then(setSetores).catch(() => {})
  }, [])
  return { funcionarios, setores: setores.filter(s => s.ativo) }
}

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
        <SeletorMaterial produtos={produtos} valor={produtoId} aoMudar={setProdutoId} autoFocus={!produtoInicial} />
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
  const [dados, setDados] = useState({ setor_id: '', finalidade: '', entregue_por: entreguePorPadrao || '', observacao: '' })
  const [pessoa, setPessoa] = useState<Pessoa>({ funcionario_id: null, nome: '' })
  const { funcionarios, setores } = usePessoas()
  const [linhas, setLinhas] = useState<LinhaItem[]>([linhaVazia()])

  // Ao escolher um funcionário cadastrado, o setor dele vem preenchido (dá para trocar).
  function escolherPessoa(p: Pessoa) {
    setPessoa(p)
    const f = p.funcionario_id ? funcionarios.find(x => x.id === p.funcionario_id) : undefined
    if (f?.setor_id && setores.some(s => s.id === f.setor_id)) setDados(d => ({ ...d, setor_id: String(f.setor_id) }))
  }
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof dados) => (e: { target: { value: string } }) => setDados({ ...dados, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const itens = itensPreenchidos(linhas)
      if (!itens.length) throw new Error('Adicione pelo menos um material com quantidade')
      const { id } = await api<{ id: number }>('/api/requisicoes', {
        method: 'POST',
        json: { ...dados, setor_id: dados.setor_id ? Number(dados.setor_id) : null, funcionario_id: pessoa.funcionario_id, retirado_por: pessoa.nome, itens }
      })
      await aoConcluir(id)
    })
  }

  return (
    <ModalFormulario titulo="Nova requisição de retirada" descricao="Baixa os materiais do estoque e gera o comprovante." aoFechar={aoFechar} largura="max-w-2xl" aoEnviar={enviar} rotuloEnviar="Registrar retirada" enviando={enviando}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Retirado por"><SeletorFuncionario funcionarios={funcionarios} valor={pessoa} aoMudar={escolherPessoa} autoFocus /></Campo>
        <Campo rotulo="Setor / obra" opcional>
          <select value={dados.setor_id} onChange={campo('setor_id')} className={classeInput}>
            <option value="">{setores.length ? '— Não informado —' : 'Cadastre em Pessoas e setores'}</option>
            {setores.map(s => <option key={s.id} value={s.id}>{s.tipo === 'OBRA' ? 'Obra: ' : ''}{s.nome}</option>)}
          </select>
        </Campo>
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
  const [pessoa, setPessoa] = useState<Pessoa>({ funcionario_id: null, nome: '' })
  const { funcionarios } = usePessoas()
  const { enviando, erro, executar } = useEnvio()

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const { requisicao_id } = await api<{ requisicao_id: number }>(`/api/reservas/${reserva.id}`, { method: 'POST', json: { retirado_por: pessoa.nome, funcionario_id: pessoa.funcionario_id } })
      await aoConcluir(requisicao_id)
    })
  }

  return (
    <ModalFormulario titulo="Retirar reserva" descricao={`${reserva.numero} · ${reserva.finalidade}`} aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar="Confirmar retirada" enviando={enviando}>
      <Campo rotulo="Retirado por">
        <SeletorFuncionario funcionarios={funcionarios} valor={pessoa} aoMudar={setPessoa} autoFocus />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}
