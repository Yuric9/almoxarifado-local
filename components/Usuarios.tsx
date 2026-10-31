'use client'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { api, formatarData, mensagemErro } from '@/lib/cliente'
import { PERFIS, type Perfil, type Usuario } from '@/lib/tipos'
import { useUsuario } from './Perfil'
import { AvisoErro, Badge, Botao, Campo, ModalFormulario, Painel, Tabela, celula, classeInput, useEnvio } from './ui'

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  ADMIN: 'Tudo, inclusive usuários, configurações, ajustes, estornos e exclusões',
  ALMOXARIFE: 'Entradas, retiradas, reservas, baixas, materiais e importações',
  CONSULTA: 'Só consulta e relatórios'
}

/** Lista e cadastro de usuários (só administrador). */
export function GerenciarUsuarios({ notificar }: { notificar: (msg: string, erro?: boolean) => void }) {
  const eu = useUsuario()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null)

  const carregar = useCallback(async () => {
    try { setUsuarios(await api<Usuario[]>('/api/usuarios')) } catch (e) { notificar(mensagemErro(e), true) }
  }, [notificar])
  useEffect(() => { carregar() }, [carregar])

  async function alternarAtivo(u: Usuario) {
    try {
      await api(`/api/usuarios/${u.id}`, { method: 'PATCH', json: { ativo: !u.ativo } })
      await carregar()
      notificar(u.ativo ? `${u.nome} foi desativado` : `${u.nome} foi reativado`)
    } catch (e) {
      notificar(mensagemErro(e), true)
    }
  }

  return (
    <Painel titulo="Usuários" acoes={<Botao variante="fantasma" onClick={() => setEditando('novo')} icone={<Plus size={16} />}>Novo usuário</Botao>} semPadding>
      <Tabela colunas={[{ titulo: 'Nome' }, { titulo: 'Usuário' }, { titulo: 'Perfil' }, { titulo: 'Desde' }, { titulo: '', largura: 'w-24' }]} vazio="Nenhum usuário.">
        {usuarios.map(u => (
          <tr key={u.id} className={u.ativo ? '' : 'opacity-50'}>
            <td className={`${celula} font-medium`}>{u.nome}{u.id === eu?.id && <span className="ml-2 text-xs text-slate-400">(você)</span>}</td>
            <td className={`${celula} font-mono text-xs text-slate-600`}>{u.login}</td>
            <td className={celula}>
              <Badge tom={u.perfil === 'ADMIN' ? 'azul' : u.perfil === 'ALMOXARIFE' ? 'verde' : 'neutro'}>{PERFIS[u.perfil]}</Badge>
              {!u.ativo && <span className="ml-2 text-xs text-red-700">desativado</span>}
            </td>
            <td className={`${celula} whitespace-nowrap text-slate-500`}>{formatarData(u.criado_em).slice(0, 10)}</td>
            <td className={`${celula} text-right`}>
              <div className="flex justify-end gap-1">
                <button aria-label={`Editar ${u.nome}`} title="Editar / nova senha" onClick={() => setEditando(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil size={16} /></button>
                {u.id !== eu?.id && (
                  <button aria-label={u.ativo ? `Desativar ${u.nome}` : `Reativar ${u.nome}`} title={u.ativo ? 'Desativar' : 'Reativar'} onClick={() => alternarAtivo(u)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">{u.ativo ? <UserX size={16} /> : <UserCheck size={16} />}</button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Tabela>
      <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        Usuários não são excluídos, só desativados, para o histórico continuar mostrando quem fez cada movimentação.
      </p>
      {editando && (
        <UsuarioModal usuario={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)}
          aoConcluir={async msg => { setEditando(null); await carregar(); notificar(msg) }} />
      )}
    </Painel>
  )
}

function UsuarioModal({ usuario, aoFechar, aoConcluir }: { usuario: Usuario | null; aoFechar: () => void; aoConcluir: (msg: string) => Promise<void> }) {
  const [form, setForm] = useState({ nome: usuario?.nome ?? '', login: usuario?.login ?? '', perfil: (usuario?.perfil ?? 'ALMOXARIFE') as Perfil, senha: '' })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      if (usuario) {
        await api(`/api/usuarios/${usuario.id}`, { method: 'PATCH', json: { nome: form.nome, perfil: form.perfil, senha: form.senha || undefined } })
        await aoConcluir(form.senha ? 'Usuário atualizado e senha redefinida' : 'Usuário atualizado')
      } else {
        await api('/api/usuarios', { method: 'POST', json: form })
        await aoConcluir(`Usuário ${form.login} criado`)
      }
    })
  }

  return (
    <ModalFormulario titulo={usuario ? `Editar ${usuario.nome}` : 'Novo usuário'} aoFechar={aoFechar} aoEnviar={enviar} rotuloEnviar={usuario ? 'Salvar' : 'Criar usuário'} enviando={enviando}>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Nome"><input autoFocus required value={form.nome} onChange={campo('nome')} className={classeInput} /></Campo>
        <Campo rotulo="Usuário (para entrar)">
          <input required disabled={!!usuario} value={form.login} onChange={campo('login')} className={`${classeInput} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="ex.: carlos" autoCapitalize="none" />
        </Campo>
      </div>
      <Campo rotulo="Perfil">
        <div className="space-y-1.5" role="radiogroup">
          {(Object.keys(PERFIS) as Perfil[]).map(p => (
            <label key={p} className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
              <input type="radio" name="perfil" checked={form.perfil === p} onChange={() => setForm({ ...form, perfil: p })} className="mt-0.5" />
              <span><b>{PERFIS[p]}</b> <span className="text-slate-500">— {DESCRICAO_PERFIL[p]}</span></span>
            </label>
          ))}
        </div>
      </Campo>
      <Campo rotulo={usuario ? 'Nova senha' : 'Senha'} opcional={!!usuario}>
        <input type="password" required={!usuario} autoComplete="new-password" value={form.senha} onChange={campo('senha')} className={classeInput}
          placeholder={usuario ? 'Deixe em branco para manter a atual' : 'Pelo menos 6 caracteres'} />
      </Campo>
      <AvisoErro texto={erro} />
    </ModalFormulario>
  )
}

/** Qualquer usuário troca a própria senha. */
export function MinhaSenha({ notificar }: { notificar: (msg: string, erro?: boolean) => void }) {
  const eu = useUsuario()
  const [form, setForm] = useState({ atual: '', nova: '', confirmar: '' })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      if (form.nova !== form.confirmar) throw new Error('As senhas novas não são iguais')
      await api('/api/auth', { method: 'POST', json: { acao: 'trocar-senha', senha_atual: form.atual, senha_nova: form.nova } })
      setForm({ atual: '', nova: '', confirmar: '' })
      notificar('Senha alterada')
    })
  }

  return (
    <Painel titulo="Minha conta">
      <p className="mb-3 text-sm text-slate-600">
        <b>{eu?.nome}</b> · usuário <span className="font-mono">{eu?.login}</span> · {eu ? PERFIS[eu.perfil] : ''}
      </p>
      <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Senha atual"><input type="password" required autoComplete="current-password" value={form.atual} onChange={campo('atual')} className={classeInput} /></Campo>
        <Campo rotulo="Nova senha"><input type="password" required autoComplete="new-password" value={form.nova} onChange={campo('nova')} className={classeInput} /></Campo>
        <Campo rotulo="Repita a nova"><input type="password" required autoComplete="new-password" value={form.confirmar} onChange={campo('confirmar')} className={classeInput} /></Campo>
        <div className="sm:col-span-3"><AvisoErro texto={erro} /></div>
        <div className="flex justify-end sm:col-span-3">
          <Botao type="submit" disabled={enviando} icone={<KeyRound size={16} />}>{enviando ? 'Salvando…' : 'Trocar senha'}</Botao>
        </div>
      </form>
    </Painel>
  )
}
