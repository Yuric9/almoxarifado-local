import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fecharBanco, getDb } from '@/lib/db'
import * as auth from '@/lib/auth'
import * as repo from '@/lib/repository'

let pasta: string

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-'))
  process.env.ALMOXARIFADO_DATA_DIR = pasta
})

afterEach(() => {
  fecharBanco()
  fs.rmSync(pasta, { recursive: true, force: true })
})

describe('primeiro acesso e login', () => {
  it('pede para criar o administrador, que só pode ser criado uma vez', () => {
    expect(auth.situacaoAcesso()).toBe('criar')
    auth.criarPrimeiroAdministrador({ nome: 'Yuri', login: 'Yuri', senha: 'segredo1' })
    expect(auth.situacaoAcesso()).toBe('login')
    expect(auth.listarUsuarios()).toMatchObject([{ nome: 'Yuri', login: 'yuri', perfil: 'ADMIN', ativo: 1 }])
    expect(() => auth.criarPrimeiroAdministrador({ nome: 'Outro', login: 'outro', senha: 'segredo1' })).toThrow('já foi criado')
  })

  it('guarda só o hash da senha e confere usuário e senha', () => {
    auth.criarPrimeiroAdministrador({ nome: 'Yuri', login: 'yuri', senha: 'segredo1' })
    const { senha_hash } = getDb().prepare('SELECT senha_hash FROM usuarios').get() as { senha_hash: string }
    expect(senha_hash).not.toContain('segredo1')
    expect(senha_hash.startsWith('scrypt$')).toBe(true)

    expect(() => auth.entrar('yuri', 'errada')).toThrow('Usuário ou senha incorretos')
    expect(() => auth.entrar('ninguem', 'segredo1')).toThrow('Usuário ou senha incorretos')
    const { token } = auth.entrar('YURI', 'segredo1')
    expect(auth.usuarioDaSessao(token)).toMatchObject({ login: 'yuri', perfil: 'ADMIN' })
    auth.sair(token)
    expect(auth.usuarioDaSessao(token)).toBeNull()
  })

  it('valida senha curta, login com espaço e duplicado', () => {
    expect(() => auth.criarUsuario({ nome: 'A', login: 'ana', senha: '123', perfil: 'CONSULTA' })).toThrow('6 caracteres')
    expect(() => auth.criarUsuario({ nome: 'A', login: 'ana maria', senha: '123456', perfil: 'CONSULTA' })).toThrow('sem espaço')
    auth.criarUsuario({ nome: 'Ana', login: 'ana', senha: '123456', perfil: 'CONSULTA' })
    expect(() => auth.criarUsuario({ nome: 'Ana 2', login: 'ANA', senha: '123456', perfil: 'CONSULTA' })).toThrow('já existe')
  })
})

describe('gestão de usuários', () => {
  it('desativar ou trocar a senha encerra as sessões; usuário desativado não entra', () => {
    const id = auth.criarUsuario({ nome: 'Carlos', login: 'carlos', senha: '123456', perfil: 'ALMOXARIFE' })
    auth.criarUsuario({ nome: 'Adm', login: 'adm', senha: '123456', perfil: 'ADMIN' })
    const { token } = auth.entrar('carlos', '123456')
    auth.atualizarUsuario(id, { senha: 'novasenha' })
    expect(auth.usuarioDaSessao(token)).toBeNull()
    expect(() => auth.entrar('carlos', '123456')).toThrow('incorretos')
    auth.entrar('carlos', 'novasenha')
    auth.atualizarUsuario(id, { ativo: false })
    expect(() => auth.entrar('carlos', 'novasenha')).toThrow('desativado')
  })

  it('nunca deixa o sistema sem administrador ativo', () => {
    const adm = auth.criarUsuario({ nome: 'Adm', login: 'adm', senha: '123456', perfil: 'ADMIN' })
    expect(() => auth.atualizarUsuario(adm, { perfil: 'CONSULTA' })).toThrow('pelo menos um administrador')
    expect(() => auth.atualizarUsuario(adm, { ativo: false })).toThrow('pelo menos um administrador')
    auth.criarUsuario({ nome: 'Adm 2', login: 'adm2', senha: '123456', perfil: 'ADMIN' })
    auth.atualizarUsuario(adm, { perfil: 'CONSULTA' })
  })

  it('troca a própria senha só confirmando a atual', () => {
    const id = auth.criarUsuario({ nome: 'Ana', login: 'ana', senha: '123456', perfil: 'CONSULTA' })
    expect(() => auth.trocarMinhaSenha(id, 'errada', 'nova123')).toThrow('não confere')
    auth.trocarMinhaSenha(id, '123456', 'nova123')
    auth.entrar('ana', 'nova123')
  })

  it('recupera a senha do administrador com o arquivo REDEFINIR-SENHA.txt', () => {
    auth.criarPrimeiroAdministrador({ nome: 'Yuri', login: 'yuri', senha: 'esqueci1' })
    expect(() => auth.redefinirSenhaAdministrador({ login: 'yuri', senha: 'nova123' })).toThrow('não está liberada')
    fs.writeFileSync(path.join(pasta, 'REDEFINIR-SENHA.txt'), '')
    expect(auth.situacaoAcesso()).toBe('redefinir')
    auth.redefinirSenhaAdministrador({ login: 'yuri', senha: 'nova123' })
    expect(fs.existsSync(path.join(pasta, 'REDEFINIR-SENHA.txt'))).toBe(false)
    expect(auth.situacaoAcesso()).toBe('login')
    auth.entrar('yuri', 'nova123')
  })
})

describe('quem fez cada operação', () => {
  it('grava o usuário logado nas movimentações, retiradas e reservas', () => {
    const id = auth.criarUsuario({ nome: 'Carlos Lima', login: 'carlos', senha: '123456', perfil: 'ALMOXARIFE' })
    const carlos = auth.listarUsuarios().find(u => u.id === id)!
    const produto = auth.comoUsuario(carlos, () => repo.criarProduto({ nome: 'Cimento', quantidade: 10 }))
    auth.comoUsuario(carlos, () => {
      repo.registrarEntrada({ produto_id: produto, quantidade: 5 })
      repo.criarRequisicao({ retirado_por: 'João', itens: [{ produto_id: produto, quantidade: 2 }] })
      repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: produto, quantidade: 1 }] })
    })
    expect(repo.listarMovimentacoes().map(m => m.usuario_nome)).toEqual(['Carlos Lima', 'Carlos Lima', 'Carlos Lima'])
    expect(repo.listarRequisicoes()[0].usuario_nome).toBe('Carlos Lima')
    expect(repo.listarReservas()[0].usuario_nome).toBe('Carlos Lima')
    // Fora de uma requisição logada (rotinas internas) fica em branco, sem erro.
    repo.registrarEntrada({ produto_id: produto, quantidade: 1 })
    expect(repo.listarMovimentacoes()[0].usuario_nome).toBeNull()
  })
})
