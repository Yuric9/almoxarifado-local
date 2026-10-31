'use client'
import { useState, type FormEvent } from 'react'
import { KeyRound, LogIn, ShieldCheck, Warehouse } from 'lucide-react'
import { api } from '@/lib/cliente'
import { AvisoErro, Botao, Campo, classeInput, useEnvio } from './ui'

export type SituacaoAcesso = 'criar' | 'redefinir' | 'login'

/**
 * Tela antes de entrar no sistema:
 * - criar: primeira vez (ou banco antigo, sem usuários) → cadastra o administrador;
 * - redefinir: arquivo REDEFINIR-SENHA.txt na pasta de dados → nova senha para um administrador;
 * - login: usuário e senha.
 */
export function TelaAcesso({ situacao, administradores, empresa, pastaDados, aoEntrar }: {
  situacao: SituacaoAcesso
  administradores: Array<{ login: string; nome: string }>
  empresa?: string
  pastaDados?: string
  aoEntrar: () => Promise<void>
}) {
  const [form, setForm] = useState({ nome: '', login: administradores[0]?.login ?? '', senha: '', confirmar: '' })
  const { enviando, erro, executar } = useEnvio()
  const campo = (nome: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [nome]: e.target.value })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    executar(async () => {
      if (situacao !== 'login' && form.senha !== form.confirmar) throw new Error('As senhas não são iguais')
      if (situacao === 'criar') await api('/api/auth', { method: 'POST', json: { acao: 'primeiro-acesso', nome: form.nome, login: form.login, senha: form.senha } })
      else if (situacao === 'redefinir') {
        await api('/api/auth', { method: 'POST', json: { acao: 'redefinir', login: form.login, senha: form.senha } })
        await api('/api/auth', { method: 'POST', json: { acao: 'entrar', login: form.login, senha: form.senha } })
      } else await api('/api/auth', { method: 'POST', json: { acao: 'entrar', login: form.login, senha: form.senha } })
      await aoEntrar()
    })
  }

  const titulo = situacao === 'criar' ? 'Criar o administrador' : situacao === 'redefinir' ? 'Redefinir senha do administrador' : 'Entrar'
  const Icone = situacao === 'criar' ? ShieldCheck : situacao === 'redefinir' ? KeyRound : LogIn

  return (
    <div className="flex min-h-screen items-center justify-center bg-fundo p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white"><Warehouse size={22} /></div>
          <div className="leading-tight">
            <p className="text-lg font-semibold text-slate-900">Almoxarifado</p>
            <p className="text-xs text-slate-500">{empresa || 'Controle de estoque'}</p>
          </div>
        </div>

        <form onSubmit={enviar} className="space-y-4 rounded-lg border border-slate-200 bg-superficie p-6 shadow-sm">
          <h1 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Icone size={18} className="text-blue-700" /> {titulo}</h1>

          {situacao === 'criar' && (
            <p className="text-sm text-slate-600">
              Primeiro acesso: crie o usuário <b>administrador</b>. Depois ele poderá cadastrar os demais usuários em Configurações.
            </p>
          )}
          {situacao === 'redefinir' && (
            <p className="text-sm text-slate-600">
              Foi encontrado o arquivo <b>REDEFINIR-SENHA.txt</b> na pasta de dados. Escolha o administrador e defina uma nova senha. O arquivo é apagado em seguida.
            </p>
          )}

          {situacao === 'criar' && (
            <Campo rotulo="Seu nome">
              <input autoFocus required value={form.nome} onChange={campo('nome')} className={classeInput} placeholder="Ex.: Yuri Cesar" />
            </Campo>
          )}

          {situacao === 'redefinir' ? (
            <Campo rotulo="Administrador">
              <select value={form.login} onChange={campo('login')} className={classeInput}>
                {administradores.map(a => <option key={a.login} value={a.login}>{a.nome} ({a.login})</option>)}
              </select>
            </Campo>
          ) : (
            <Campo rotulo="Usuário">
              <input autoFocus={situacao === 'login'} required autoComplete="username" value={form.login} onChange={campo('login')} className={classeInput}
                placeholder={situacao === 'criar' ? 'Ex.: yuri (sem espaços)' : ''} autoCapitalize="none" />
            </Campo>
          )}

          <Campo rotulo={situacao === 'login' ? 'Senha' : 'Nova senha'}>
            <input type="password" required autoComplete={situacao === 'login' ? 'current-password' : 'new-password'} value={form.senha} onChange={campo('senha')} className={classeInput}
              placeholder={situacao === 'login' ? '' : 'Pelo menos 6 caracteres'} />
          </Campo>
          {situacao !== 'login' && (
            <Campo rotulo="Repita a senha">
              <input type="password" required autoComplete="new-password" value={form.confirmar} onChange={campo('confirmar')} className={classeInput} />
            </Campo>
          )}

          <AvisoErro texto={erro} />
          <Botao type="submit" variante="primario" disabled={enviando} className="w-full">
            {enviando ? 'Aguarde…' : situacao === 'criar' ? 'Criar e entrar' : situacao === 'redefinir' ? 'Salvar nova senha e entrar' : 'Entrar'}
          </Botao>

          {situacao === 'login' && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">Esqueci a senha</summary>
              <p className="mt-2">
                Peça ao administrador para definir uma nova senha em Configurações → Usuários. Se foi o administrador que esqueceu,
                crie um arquivo chamado <b>REDEFINIR-SENHA.txt</b> (pode ser vazio) na pasta de dados do sistema
                {pastaDados ? <> (<span className="break-all font-mono">{pastaDados}</span>)</> : null} e abra o sistema de novo.
              </p>
            </details>
          )}
        </form>
      </div>
    </div>
  )
}
