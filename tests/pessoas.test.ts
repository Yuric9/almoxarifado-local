import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fecharBanco } from '@/lib/db'
import * as repo from '@/lib/repository'
import * as pessoas from '@/lib/pessoas'
import { relatorioConsumo } from '@/lib/relatorios'

let pasta: string

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-'))
  process.env.ALMOXARIFADO_DATA_DIR = pasta
})

afterEach(() => {
  fecharBanco()
  fs.rmSync(pasta, { recursive: true, force: true })
})

const hoje = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

describe('setores e funcionários', () => {
  it('cadastra, valida duplicados e desativa sem excluir', () => {
    const obra = pessoas.criarSetor({ nome: ' Obra  Escola Central ', tipo: 'OBRA' })
    expect(() => pessoas.criarSetor({ nome: 'obra escola central' })).toThrow('já está cadastrado')
    const joao = pessoas.criarFuncionario({ nome: 'João Silva', matricula: '123', funcao: 'Pedreiro', setor_id: obra })
    expect(() => pessoas.criarFuncionario({ nome: 'Outro', matricula: '123' })).toThrow('matrícula 123')
    expect(pessoas.listarSetores()[0]).toMatchObject({ nome: 'Obra Escola Central', tipo: 'OBRA', total_funcionarios: 1 })
    pessoas.atualizarFuncionario(joao, { ativo: false })
    expect(pessoas.listarFuncionarios()[0]).toMatchObject({ nome: 'João Silva', setor: 'Obra Escola Central', ativo: 0 })
  })

  it('a retirada usa o funcionário cadastrado e preenche o setor dele', () => {
    const obra = pessoas.criarSetor({ nome: 'Obra Escola', tipo: 'OBRA' })
    const joao = pessoas.criarFuncionario({ nome: 'João Silva', setor_id: obra })
    const cimento = repo.criarProduto({ nome: 'Cimento', quantidade: 50 })
    const id = repo.criarRequisicao({ funcionario_id: joao, itens: [{ produto_id: cimento, quantidade: 5 }] })
    expect(repo.obterRequisicao(id)).toMatchObject({ retirado_por: 'João Silva', setor: 'Obra Escola' })
    expect(pessoas.listarFuncionarios()[0].total_retiradas).toBe(1)
  })

  it('nome digitado igual ao de um funcionário é ligado ao cadastro; desativado não retira', () => {
    const joao = pessoas.criarFuncionario({ nome: 'João Silva' })
    const cimento = repo.criarProduto({ nome: 'Cimento', quantidade: 50 })
    repo.criarRequisicao({ retirado_por: 'joão silva', setor: 'Manutenção', itens: [{ produto_id: cimento, quantidade: 1 }] })
    expect(pessoas.listarFuncionarios()[0].total_retiradas).toBe(1)
    pessoas.atualizarFuncionario(joao, { ativo: false })
    expect(() => repo.criarRequisicao({ funcionario_id: joao, itens: [{ produto_id: cimento, quantidade: 1 }] })).toThrow('desativado')
  })
})

describe('consumo por setor e por funcionário', () => {
  it('soma o que cada setor e cada pessoa retirou, sem as estornadas', () => {
    const obra = pessoas.criarSetor({ nome: 'Obra Escola', tipo: 'OBRA' })
    const manut = pessoas.criarSetor({ nome: 'Manutenção' })
    const joao = pessoas.criarFuncionario({ nome: 'João', setor_id: obra })
    const ana = pessoas.criarFuncionario({ nome: 'Ana', setor_id: manut })
    const cimento = repo.criarProduto({ nome: 'Cimento', unidade: 'SC', quantidade: 100 })
    const luva = repo.criarProduto({ nome: 'Luva', unidade: 'PAR', quantidade: 100 })
    repo.criarRequisicao({ funcionario_id: joao, itens: [{ produto_id: cimento, quantidade: 10 }, { produto_id: luva, quantidade: 2 }] })
    repo.criarRequisicao({ funcionario_id: joao, itens: [{ produto_id: cimento, quantidade: 5 }] })
    repo.criarRequisicao({ funcionario_id: ana, itens: [{ produto_id: luva, quantidade: 1 }] })
    const estornada = repo.criarRequisicao({ funcionario_id: ana, itens: [{ produto_id: cimento, quantidade: 30 }] })
    repo.estornarRequisicao(estornada, 'Lançada errada')
    repo.criarRequisicao({ retirado_por: 'Visitante', itens: [{ produto_id: luva, quantidade: 1 }] })

    const porSetor = relatorioConsumo(hoje(), hoje(), 'setor').grupos
    expect(porSetor.map(g => [g.nome, g.retiradas, g.itens.map(i => `${i.nome}:${i.quantidade}`).join(',')])).toEqual([
      ['Obra Escola', 2, 'Cimento:15,Luva:2'],
      ['Manutenção', 1, 'Luva:1'],
      ['Sem setor informado', 1, 'Luva:1']
    ])
    const porPessoa = relatorioConsumo(hoje(), hoje(), 'funcionario').grupos
    expect(porPessoa.map(g => g.nome)).toEqual(['João', 'Ana', 'Visitante'])
  })

  it('retiradas antigas com setor só em texto viram setores cadastrados', () => {
    fs.mkdirSync(pasta, { recursive: true })
    const db = new Database(path.join(pasta, 'almoxarifado.db'))
    db.exec(`
      CREATE TABLE requisicoes (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, retirado_por TEXT NOT NULL, setor TEXT,
        finalidade TEXT, entregue_por TEXT, observacao TEXT, status TEXT NOT NULL DEFAULT 'FINALIZADA', criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO requisicoes (numero, retirado_por, setor) VALUES ('REQ-1','João','Obras'), ('REQ-2','Ana',' obras '), ('REQ-3','Bia','Limpeza'), ('REQ-4','Caio',NULL);
    `)
    db.close()
    expect(pessoas.listarSetores().map(s => [s.nome, s.total_retiradas])).toEqual([['Limpeza', 1], ['Obras', 2]])
  })
})
