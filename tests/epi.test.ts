import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb, fecharBanco } from '@/lib/db'
import * as repo from '@/lib/repository'
import * as pessoas from '@/lib/pessoas'
import { fichaEpi } from '@/lib/epi'
import { aplicarClassificacao } from '@/lib/classificacao'

let pasta: string

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-'))
  process.env.ALMOXARIFADO_DATA_DIR = pasta
})

afterEach(() => {
  fecharBanco()
  fs.rmSync(pasta, { recursive: true, force: true })
})

const produto = (id: number) => repo.listarProdutos().find(p => p.id === id)!

describe('EPI', () => {
  it('guarda CA, validade e prazo de troca só quando o material é EPI', () => {
    const luva = repo.criarProduto({ nome: 'Luva de vaqueta', quantidade: 10, epi: true, ca: 'CA 12345', ca_validade: '2027-05-01', troca_dias: '30' })
    expect(produto(luva)).toMatchObject({ epi: 1, ca: '12345', ca_validade: '2027-05-01', troca_dias: 30 })
    expect(() => repo.criarProduto({ nome: 'Bota', epi: true, troca_dias: 'abc' })).toThrow('Prazo de troca')
    expect(() => repo.criarProduto({ nome: 'Óculos', epi: true, ca_validade: '01/05/2027' })).toThrow('Validade do CA')
    repo.atualizarProduto(luva, { nome: 'Luva de vaqueta', epi: false })
    expect(produto(luva)).toMatchObject({ epi: 0, ca: null, troca_dias: null })
  })

  it('material na categoria EPI já nasce como EPI (cadastro e classificação)', () => {
    const cat = repo.criarCategoria({ nome: 'EPI' })
    const capacete = repo.criarProduto({ nome: 'Capacete', categoria_id: cat })
    expect(produto(capacete).epi).toBe(1)
    const protetor = repo.criarProduto({ nome: 'Protetor auricular' })
    expect(produto(protetor).epi).toBe(0)
    aplicarClassificacao({ itens: [{ produto_id: protetor, categoria: 'EPI' }] })
    expect(produto(protetor).epi).toBe(1)
  })

  it('a ficha lista as entregas com o CA da época, sem estornos, e calcula a próxima troca', () => {
    const joao = pessoas.criarFuncionario({ nome: 'João Silva', matricula: '101' })
    const luva = repo.criarProduto({ nome: 'Luva', quantidade: 20, epi: true, ca: '111', troca_dias: 30 })
    const cimento = repo.criarProduto({ nome: 'Cimento', quantidade: 20 })
    const r1 = repo.criarRequisicao({ funcionario_id: joao, itens: [{ produto_id: luva, quantidade: 2 }, { produto_id: cimento, quantidade: 1 }] })
    // entrega antiga: 40 dias atrás
    getDb().prepare("UPDATE requisicoes SET criado_em=datetime('now','-40 days') WHERE id=?").run(r1)
    repo.atualizarProduto(luva, { nome: 'Luva', ca: '222' })
    repo.criarRequisicao({ funcionario_id: joao, itens: [{ produto_id: luva, quantidade: 1 }] })
    const errada = repo.criarRequisicao({ funcionario_id: joao, itens: [{ produto_id: luva, quantidade: 5 }] })
    repo.estornarRequisicao(errada, 'Lançada por engano')

    const ficha = fichaEpi(joao)
    expect(ficha.funcionario).toMatchObject({ nome: 'João Silva', matricula: '101' })
    expect(ficha.entregas.map(e => [e.nome, e.quantidade, e.ca])).toEqual([['Luva', 1, '222'], ['Luva', 2, '111']])
    expect(ficha.em_uso).toHaveLength(1)
    expect(ficha.em_uso[0]).toMatchObject({ nome: 'Luva', ca: '222', troca_dias: 30, situacao: 'EM_DIA' })
  })

  it('aponta troca vencida e liga retiradas antigas ao funcionário cadastrado depois', () => {
    const bota = repo.criarProduto({ nome: 'Bota', quantidade: 5, epi: true, troca_dias: 10 })
    const antiga = repo.criarRequisicao({ retirado_por: 'maria santos', itens: [{ produto_id: bota, quantidade: 1 }] })
    getDb().prepare("UPDATE requisicoes SET criado_em=datetime('now','-20 days') WHERE id=?").run(antiga)
    const maria = pessoas.criarFuncionario({ nome: 'Maria Santos' })
    const ficha = fichaEpi(maria)
    expect(ficha.entregas).toHaveLength(1)
    expect(ficha.em_uso[0].situacao).toBe('VENCIDA')
  })
})
