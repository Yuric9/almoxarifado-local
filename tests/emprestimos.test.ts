import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb, fecharBanco } from '@/lib/db'
import * as repo from '@/lib/repository'
import * as pessoas from '@/lib/pessoas'
import * as emp from '@/lib/emprestimos'

let pasta: string

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-'))
  process.env.ALMOXARIFADO_DATA_DIR = pasta
})

afterEach(() => {
  fecharBanco()
  fs.rmSync(pasta, { recursive: true, force: true })
})

const estoque = (id: number) => repo.listarProdutos().find(p => p.id === id)!.quantidade_atual

describe('empréstimo de ferramentas', () => {
  it('empresta, devolve em partes e fecha registrando o que não voltou', () => {
    const obra = pessoas.criarSetor({ nome: 'Obra Escola', tipo: 'OBRA' })
    const joao = pessoas.criarFuncionario({ nome: 'João Silva', setor_id: obra })
    const furadeira = repo.criarProduto({ nome: 'Furadeira', quantidade: 3 })
    const marreta = repo.criarProduto({ nome: 'Marreta', quantidade: 5 })

    const id = emp.criarEmprestimo({ funcionario_id: joao, previsao_devolucao: '2099-01-10', itens: [{ produto_id: furadeira, quantidade: 1 }, { produto_id: marreta, quantidade: 2 }] })
    let e = emp.obterEmprestimo(id)
    expect(e).toMatchObject({ numero: expect.stringMatching(/^EMP-\d{4}-000001$/), retirado_por: 'João Silva', setor: 'Obra Escola', status: 'ABERTO', pendente: 3, atrasado: 0 })
    expect([estoque(furadeira), estoque(marreta)]).toEqual([2, 3])
    expect(() => emp.criarEmprestimo({ retirado_por: 'Ana', itens: [{ produto_id: furadeira, quantidade: 5 }] })).toThrow('indisponível')

    const [iFur, iMar] = e.itens
    e = emp.devolverEmprestimo(id, { itens: [{ item_id: iMar.id, devolvida: 1 }] })
    expect(e).toMatchObject({ status: 'ABERTO', pendente: 2 })
    expect(estoque(marreta)).toBe(4)
    expect(() => emp.devolverEmprestimo(id, { itens: [{ item_id: iMar.id, devolvida: 2 }] })).toThrow('pendente')

    e = emp.devolverEmprestimo(id, { itens: [{ item_id: iFur.id, devolvida: 1 }, { item_id: iMar.id, nao_devolvida: 1 }], observacao: 'Marreta quebrou' })
    expect(e).toMatchObject({ status: 'DEVOLVIDO', pendente: 0 })
    expect(e.devolvido_em).toBeTruthy()
    expect(e.observacao).toContain('Marreta quebrou')
    expect([estoque(furadeira), estoque(marreta)]).toEqual([3, 4])
    expect(() => emp.devolverEmprestimo(id, { itens: [{ item_id: iFur.id, devolvida: 1 }] })).toThrow('já foi devolvido')

    const movs = getDb().prepare("SELECT origem, tipo, quantidade FROM movimentacoes WHERE emprestimo_id=? ORDER BY id").all(id)
    expect(movs).toEqual([
      { origem: 'EMPRESTIMO', tipo: 'SAIDA', quantidade: 1 },
      { origem: 'EMPRESTIMO', tipo: 'SAIDA', quantidade: 2 },
      { origem: 'DEVOLUCAO', tipo: 'ENTRADA', quantidade: 1 },
      { origem: 'DEVOLUCAO', tipo: 'ENTRADA', quantidade: 1 }
    ])
  })

  it('marca como atrasado depois da data prevista e não deixa excluir o material', () => {
    const serra = repo.criarProduto({ nome: 'Serra mármore', quantidade: 1 })
    const id = emp.criarEmprestimo({ retirado_por: 'Pedro', previsao_devolucao: '2020-01-01', itens: [{ produto_id: serra, quantidade: 1 }] })
    expect(emp.listarEmprestimos()[0]).toMatchObject({ id, atrasado: 1 })
    expect(() => repo.excluirProduto(serra)).toThrow('Inativar')
    expect(() => emp.criarEmprestimo({ retirado_por: 'Pedro', previsao_devolucao: '10/01/2020', itens: [{ produto_id: serra, quantidade: 1 }] })).toThrow()
  })
})
