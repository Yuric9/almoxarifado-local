import { AsyncLocalStorage } from 'node:async_hooks'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { cookies } from 'next/headers'
import { PERFIS, type Perfil } from './constantes'
import { getDb } from './db'
import { pastaDados } from './paths'

/**
 * Usuários, senhas, sessões e permissões.
 *
 * - Senhas: guardadas só como hash scrypt com "sal" aleatório (nem o administrador consegue lê-las).
 * - Sessão: um token aleatório num cookie httpOnly; no banco fica apenas o hash do token.
 * - Permissões por perfil: ADMIN > ALMOXARIFE > CONSULTA.
 * - O usuário da requisição atual fica num AsyncLocalStorage, para o repositório registrar
 *   "quem fez" em cada movimentação sem precisar passar o usuário de função em função.
 */

export { PERFIS, type Perfil }

/** O que cada nível de acesso exige. */
export type Nivel = 'leitura' | 'operacao' | 'admin'
const PODE: Record<Nivel, Perfil[]> = {
  leitura: ['ADMIN', 'ALMOXARIFE', 'CONSULTA'],
  operacao: ['ADMIN', 'ALMOXARIFE'],
  admin: ['ADMIN']
}

export type Usuario = { id: number; nome: string; login: string; perfil: Perfil; ativo: number; criado_em: string }

export const COOKIE_SESSAO = 'almox_sessao'
const DURACAO_SESSAO_DIAS = 7
const ARQUIVO_REDEFINIR = 'REDEFINIR-SENHA.txt'

/** Erro com código HTTP (401 = não entrou; 403 = perfil sem permissão). */
export class ErroAcesso extends Error {
  constructor(mensagem: string, public status: 401 | 403) {
    super(mensagem)
  }
}

/* ------------------------------------------------------------------ usuário da requisição */

const contexto = new AsyncLocalStorage<Usuario>()

/** Usuário logado que está fazendo a operação (null em testes e rotinas internas). */
export function usuarioAtual(): Usuario | null {
  return contexto.getStore() ?? null
}

/** Executa algo "como" um usuário (usado em testes e pelo controle de acesso). */
export function comoUsuario<T>(usuario: Usuario, acao: () => T): T {
  return contexto.run(usuario, acao)
}

/* ------------------------------------------------------------------ senhas */

function gerarHash(senha: string) {
  const sal = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(senha, sal, 64).toString('hex')
  return `scrypt$${sal}$${hash}`
}

function conferirSenha(senha: string, guardado: string) {
  const [, sal, hash] = guardado.split('$')
  if (!sal || !hash) return false
  const calculado = crypto.scryptSync(senha, sal, 64)
  const esperado = Buffer.from(hash, 'hex')
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado)
}

function senhaValida(valor: unknown) {
  const senha = typeof valor === 'string' ? valor : ''
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres')
  return senha
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/* ------------------------------------------------------------------ usuários */

const CAMPOS = 'id, nome, login, perfil, ativo, criado_em'

export function listarUsuarios(): Usuario[] {
  return getDb().prepare(`SELECT ${CAMPOS} FROM usuarios ORDER BY nome COLLATE NOCASE`).all() as Usuario[]
}

export function existeUsuario() {
  return !!getDb().prepare('SELECT 1 FROM usuarios LIMIT 1').get()
}

function perfilValido(valor: unknown): Perfil {
  if (typeof valor === 'string' && valor in PERFIS) return valor as Perfil
  throw new Error('Escolha o perfil do usuário')
}

export function criarUsuario(input: { nome: unknown; login: unknown; senha: unknown; perfil: unknown }) {
  const nome = texto(input.nome)
  const login = texto(input.login).toLowerCase()
  if (!nome) throw new Error('Informe o nome')
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new Error('Usuário deve ter de 3 a 30 letras, números, ponto, hífen ou sublinhado (sem espaço)')
  const db = getDb()
  if (db.prepare('SELECT 1 FROM usuarios WHERE login=?').get(login)) throw new Error(`O usuário "${login}" já existe`)
  const r = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?,?,?,?)')
    .run(nome, login, gerarHash(senhaValida(input.senha)), perfilValido(input.perfil))
  return Number(r.lastInsertRowid)
}

function adminsAtivos(excetoId = 0) {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM usuarios WHERE perfil='ADMIN' AND ativo=1 AND id<>?").get(excetoId) as { n: number }).n
}

/** Muda nome, perfil, situação e (opcionalmente) a senha. Nunca deixa o sistema sem administrador ativo. */
export function atualizarUsuario(id: number, input: { nome?: unknown; perfil?: unknown; ativo?: unknown; senha?: unknown }) {
  const db = getDb()
  const atual = db.prepare(`SELECT ${CAMPOS} FROM usuarios WHERE id=?`).get(id) as Usuario | undefined
  if (!atual) throw new Error('Usuário não encontrado')
  const nome = input.nome === undefined ? atual.nome : texto(input.nome)
  if (!nome) throw new Error('Informe o nome')
  const perfil = input.perfil === undefined ? atual.perfil : perfilValido(input.perfil)
  const ativo = input.ativo === undefined ? atual.ativo : input.ativo ? 1 : 0
  const deixaDeSerAdmin = atual.perfil === 'ADMIN' && atual.ativo && (perfil !== 'ADMIN' || !ativo)
  if (deixaDeSerAdmin && adminsAtivos(id) === 0) throw new Error('O sistema precisa de pelo menos um administrador ativo')

  db.transaction(() => {
    db.prepare('UPDATE usuarios SET nome=?, perfil=?, ativo=? WHERE id=?').run(nome, perfil, ativo, id)
    if (input.senha !== undefined && input.senha !== '') {
      db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(gerarHash(senhaValida(input.senha)), id)
      db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(id)
    }
    if (!ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(id)
  })()
}

/** O próprio usuário troca a senha, confirmando a atual. */
export function trocarMinhaSenha(id: number, atual: unknown, nova: unknown) {
  const row = getDb().prepare('SELECT senha_hash FROM usuarios WHERE id=?').get(id) as { senha_hash: string } | undefined
  if (!row || !conferirSenha(String(atual ?? ''), row.senha_hash)) throw new Error('A senha atual não confere')
  getDb().prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(gerarHash(senhaValida(nova)), id)
}

/* ------------------------------------------------------------------ primeiro acesso e recuperação */

function arquivoRedefinir() {
  return path.join(pastaDados(), ARQUIVO_REDEFINIR)
}

/**
 * Situação de acesso:
 * - "criar": nenhum usuário ainda (primeira vez, ou banco antigo sem login);
 * - "redefinir": existe o arquivo REDEFINIR-SENHA.txt na pasta de dados (recuperação de senha do administrador);
 * - "login": normal.
 */
export function situacaoAcesso(): 'criar' | 'redefinir' | 'login' {
  if (!existeUsuario()) return 'criar'
  if (fs.existsSync(arquivoRedefinir())) return 'redefinir'
  return 'login'
}

/** Primeiro acesso: cria o administrador. Só funciona enquanto não houver nenhum usuário. */
export function criarPrimeiroAdministrador(input: { nome: unknown; login: unknown; senha: unknown }) {
  const db = getDb()
  return db.transaction(() => {
    if (existeUsuario()) throw new Error('O administrador já foi criado. Entre com usuário e senha.')
    return criarUsuario({ ...input, perfil: 'ADMIN' })
  })()
}

/**
 * Recuperação: com o arquivo REDEFINIR-SENHA.txt na pasta de dados (só quem tem acesso ao computador
 * consegue criá-lo), define nova senha para um administrador e apaga o arquivo.
 */
export function redefinirSenhaAdministrador(input: { login: unknown; senha: unknown }) {
  if (situacaoAcesso() !== 'redefinir') throw new Error('Recuperação de senha não está liberada')
  const login = texto(input.login).toLowerCase()
  const admin = getDb().prepare("SELECT id FROM usuarios WHERE login=? AND perfil='ADMIN'").get(login) as { id: number } | undefined
  if (!admin) throw new Error('Administrador não encontrado')
  atualizarUsuario(admin.id, { senha: input.senha, ativo: true })
  fs.rmSync(arquivoRedefinir(), { force: true })
}

export function administradores() {
  return getDb().prepare("SELECT login, nome FROM usuarios WHERE perfil='ADMIN' ORDER BY nome").all() as Array<{ login: string; nome: string }>
}

/* ------------------------------------------------------------------ sessões */

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

/** Confere usuário e senha e devolve o token da nova sessão. */
export function entrar(loginInformado: unknown, senha: unknown) {
  const login = texto(loginInformado).toLowerCase()
  const row = getDb().prepare('SELECT id, senha_hash, ativo FROM usuarios WHERE login=?').get(login) as { id: number; senha_hash: string; ativo: number } | undefined
  // Mesma mensagem para usuário inexistente e senha errada: não revela quais usuários existem.
  if (!row || !conferirSenha(String(senha ?? ''), row.senha_hash)) throw new ErroAcesso('Usuário ou senha incorretos', 401)
  if (!row.ativo) throw new ErroAcesso('Este usuário está desativado. Fale com o administrador.', 403)
  const token = crypto.randomBytes(32).toString('hex')
  const expira = new Date(Date.now() + DURACAO_SESSAO_DIAS * 864e5).toISOString()
  const db = getDb()
  db.prepare("DELETE FROM sessoes WHERE expira_em < ?").run(new Date().toISOString())
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?,?,?)').run(hashToken(token), row.id, expira)
  return { token, maxAge: DURACAO_SESSAO_DIAS * 86400 }
}

export function sair(token: string | undefined) {
  if (token) getDb().prepare('DELETE FROM sessoes WHERE token_hash=?').run(hashToken(token))
}

export function usuarioDaSessao(token: string | undefined): Usuario | null {
  if (!token) return null
  const u = getDb().prepare(`
    SELECT u.id, u.nome, u.login, u.perfil, u.ativo, u.criado_em FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.token_hash=? AND s.expira_em > ? AND u.ativo=1
  `).get(hashToken(token), new Date().toISOString()) as Usuario | undefined
  return u ?? null
}

/**
 * Controle de acesso das rotas da API: confere a sessão e o perfil e passa a
 * registrar esse usuário como autor de tudo o que a requisição gravar.
 */
export function exigir(nivel: Nivel): Usuario {
  const usuario = usuarioDaSessao(cookies().get(COOKIE_SESSAO)?.value)
  if (!usuario) throw new ErroAcesso('Sua sessão terminou. Entre novamente.', 401)
  if (!PODE[nivel].includes(usuario.perfil)) {
    throw new ErroAcesso(nivel === 'admin'
      ? 'Só o administrador pode fazer isso.'
      : 'Seu perfil (Consulta) só permite ver e tirar relatórios.', 403)
  }
  contexto.enterWith(usuario)
  return usuario
}
