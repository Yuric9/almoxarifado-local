'use client'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, HardHat, Pencil, Plus, Power, Search } from 'lucide-react'
import { api, mensagemErro } from '@/lib/cliente'
import type { Funcionario, Setor } from '@/lib/tipos'
import { usePode } from './Perfil'
import { AvisoErro, Badge, Botao, CabecalhoPagina, Campo, ModalFormulario, Painel, Tabela, celula, celulaNumero, classeCampo, classeInput, useEnvio } from './ui'

type Notificar = (msg: string, erro?: boolean) => void

/** Cadastro de setores/obras (destino do material) e de funcionários (quem retira). */
export function TelaPessoas({ notificar }: { notificar: Notificar }) {
  const podeOperar = usePode('operacao')
  const [setores, setSetores] = useState<Setor[]>([])
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [editandoSetor, setEditandoSetor] = useState<Setor | 'novo' | null>(null)
  const [editandoFunc, setEditandoFunc] = useState<Funcionario | 'novo' | null>(null)
  const [busca, setBusca] = useState('')
  const [inativos, setInativos] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api<Setor[]>('/api/setores'), api<Funcionario[]>('/api/funcionarios')])
      setSetores(s); setFuncionarios(f)
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }, [notificar])
  useEffect(() => { carregar() }, [carregar])

  async function concluir(msg: string) {
    setEditandoSetor(null); setEditandoFunc(null)
    await carregar()
    notificar(msg)
  }

  async function alternar(url: string, ativo: number, nome: string) {
    try {
      await api(url, { method: 'PATCH', json: { ativo: !ativo } })
      await concluir(ativo ? `${nome} foi desativado` : `${nome} foi reativado`)
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }

  const termo = busca.trim().toLocaleLowerCase('pt-BR')
  const lista = funcionarios.filter(f => (inativos || f.ativo) && [f.nome, f.matricula, f.funcao, f.setor].some(v => v?.toLocaleLowerCase('pt-BR').includes(termo)))

  return (
    <>
      <CabecalhoPagina titulo="Pessoas e setores" descricao="Quem retira material e para onde ele vai. Usado na retirada e no relatório de consumo." />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Painel titulo={`Funcionários (${funcionarios.filter(f => f.ativo).length})`} semPadding
          acoes={podeOperar && <Botao variante="fantasma" onClick={() => setEditandoFunc('novo')} icone={<Plus size={16} />}>Novo funcionário</Botao>}>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, matrícula, função ou setor" aria-label="Buscar funcionário" className={`${classeCampo} w-full pl-8`} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={inativos} onChange={e => setInativos(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Mostrar desativados
            </label>
          </div>
          <Tabela colunas={[{ titulo: 'Nome' }, { titulo: 'Matrícula' }, { titulo: 'Função' }, { titulo: 'Setor / obra' }, { titulo: 'Retiradas', alinhar: 'direita' }, { titulo: '', largura: 'w-20' }]}
            vazio={funcionarios.length ? 'Nenhum funcionário encontrado.' : 'Nenhum funcionário cadastrado. Use "Novo funcionário".'}>
            {lista.map(f => (
              <tr key={f.id} className={f.ativo ? '' : 'opacity-50'}>
                <td className={`${celula} font-medium text-slate-900`}>{f.nome}{!f.ativo && <span className="ml-2 text-xs text-red-700">desativado</span>}</td>
                <td className={`${celula} font-mono text-xs text-slate-500`}>{f.matricula || '—'}</td>
                <td className={`${celula} text-slate-600`}>{f.funcao || '—'}</td>
                <td className={`${celula} text-slate-600`}>{f.setor || '—'}</td>
                <td className={`${celulaNumero} text-slate-500`}>{f.total_retiradas}</td>
                <td className={`${celula} text-right`}>
                  {podeOperar && (
                    <div className="flex justify-end gap-1">
                      <button aria-label={`Editar ${f.nome}`} title="Editar" onClick={() => setEditandoFunc(f)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil size={16} /></button>
                      <button aria-label={f.ativo ? `Desativar ${f.nome}` : `Reativar ${f.nome}`} title={f.ativo ? 'Desativar' : 'Reativar'} onClick={() => alternar(`/api/funcionarios/${f.id}`, f.ativo, f.nome)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Power size={16} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        </Painel>

        <Painel titulo={`Setores e obras (${setores.filter(s => s.ativo).length})`} semPadding
          acoes={podeOperar && <Botao variante="fantasma" onClick={() => setEditandoSetor('novo')} icone={<Plus size={16} />}>Novo</Botao>}>
          <Tabela colunas={[{ titulo: 'Nome' }, { titulo: 'Pessoas', alinhar: 'direita' }, { titulo: 'Retiradas', alinhar: 'direita' }, { titulo: '', largura: 'w-20' }]} vazio="Nenhum setor ou obra cadastrado.">
            {setores.map(s => (
              <tr key={s.id} className={s.ativo ? '' : 'opacity-50'}>
                <td className={celula}>
                  <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                    {s.tipo === 'OBRA' ? <HardHat size={15} className="text-amber-600" /> : <Building2 size={15} className="text-slate-400" />}{s.nome}
                  </span>
                  {s.tipo === 'OBRA' && <span className="ml-2"><Badge tom="amarelo">Obra</Badge></span>}
                  {!s.ativo && <span className="ml-2 text-xs text-red-700">desativado</span>}
                </td>
                <td className={`${celulaNumero} text-slate-500`}>{s.total_funcionarios}</td>
                <td className={`${celulaNumero} text-slate-500`}>{s.total_retiradas}</td>
                <td className={`${celula} text-right`}>
                  {podeOperar && (
                    <div className="flex justify-end gap-1">
                      <button aria-label={`Editar ${s.nome}`} title="Editar" onClick={() => setEditandoSetor(s)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil size={16} /></button>
                      <button aria-label={s.ativo ? `Desativar ${s.nome}` : `Reativar ${s.nome}`} title={s.ativo ? 'Desativar (obra concluída, setor extinto)' : 'Reativar'} onClick={() => alternar(`/api/setores/${s.id}`, s.ativo, s.nome)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Power size={16} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
          <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
            Setores digitados nas retiradas antigas já aparecem aqui. Desative uma obra concluída para ela sair das listas sem perder o histórico.
          </p>
        </Painel>
      </div>

      {editandoSetor && <SetorModal setor={editandoSetor === 'novo' ? null : editandoSetor} aoFechar={() => setEditandoSetor(null)} aoConcluir={concluir} />}
      {editandoFunc && <FuncionarioModal funcionario={editandoFunc === 'novo' ? null : editandoFunc} setores={setores.filter(s => s.ativo)} aoFechar={() => setEditandoFunc(null)} aoConcluir={concluir} />}
    </>
  )
}

function SetorModal({ setor, aoFechar, aoConcluir }: { setor: Setor | null; aoFechar: () => void; aoConcluir: (msg: string) => Promise<void> }) {
  const [form, setForm] = useState({ nome: setor?.nome ?? '', tipo: setor?.tipo ?? 'SETOR' })
  const { enviando, erro, executar } = useEnvio()
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      if (setor) await api(`/api/setores/${setor.id}`, { method: 'PATCH', json: form })
      else await api('/api/setores', { method: 'POST', json: form })
      await aoConcluir(setor ? 'Setor atualizado' : `${form.tipo === 'OBRA' ? 'Obra' : 'Setor'} "${form.nome}" cadastrado`)
    })
  }
  return (
    <ModalFormulario titulo={setor ? `Editar ${setor.nome}` : 'Novo setor ou obra'} aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar={setor ? 'Salvar' : 'Cadastrar'} enviando={enviando}>
      <Campo rotulo="Nome"><input autoFocus required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className={classeInput} placeholder="Ex.: Manutenção, Obra Escola Central" /></Campo>
      <div className="flex gap-4 text-sm text-slate-700" role="radiogroup" aria-label="Tipo">
        <label className="inline-flex items-center gap-2"><input type="radio" name="tipo" checked={form.tipo === 'SETOR'} onChange={() => setForm({ ...form, tipo: 'SETOR' })} /> Setor</label>
        <label className="inline-flex items-center gap-2"><input type="radio" name="tipo" checked={form.tipo === 'OBRA'} onChange={() => setForm({ ...form, tipo: 'OBRA' })} /> Obra</label>
      </div>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

function FuncionarioModal({ funcionario, setores, aoFechar, aoConcluir }: { funcionario: Funcionario | null; setores: Setor[]; aoFechar: () => void; aoConcluir: (msg: string) => Promise<void> }) {
  const [form, setForm] = useState({
    nome: funcionario?.nome ?? '', matricula: funcionario?.matricula ?? '', funcao: funcionario?.funcao ?? '',
    setor_id: funcionario?.setor_id ? String(funcionario.setor_id) : ''
  })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      const dados = { ...form, setor_id: form.setor_id ? Number(form.setor_id) : null }
      if (funcionario) await api(`/api/funcionarios/${funcionario.id}`, { method: 'PATCH', json: dados })
      else await api('/api/funcionarios', { method: 'POST', json: dados })
      await aoConcluir(funcionario ? 'Funcionário atualizado' : `${form.nome} cadastrado`)
    })
  }
  return (
    <ModalFormulario titulo={funcionario ? `Editar ${funcionario.nome}` : 'Novo funcionário'} aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar={funcionario ? 'Salvar' : 'Cadastrar'} enviando={enviando}>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <Campo rotulo="Nome completo"><input autoFocus required value={form.nome} onChange={campo('nome')} className={classeInput} /></Campo>
        <Campo rotulo="Matrícula" opcional><input value={form.matricula} onChange={campo('matricula')} className={classeInput} /></Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Função" opcional><input value={form.funcao} onChange={campo('funcao')} className={classeInput} placeholder="Ex.: Pedreiro, Eletricista" /></Campo>
        <Campo rotulo="Setor / obra" opcional>
          <select value={form.setor_id} onChange={campo('setor_id')} className={classeInput}>
            <option value="">—</option>
            {setores.map(s => <option key={s.id} value={s.id}>{s.tipo === 'OBRA' ? 'Obra: ' : ''}{s.nome}</option>)}
          </select>
        </Campo>
      </div>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}
