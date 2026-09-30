import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fecharBanco, getDb } from '@/lib/db'
import * as repo from '@/lib/repository'
import { backupAutomaticoDiario, criarBackup, listarBackups, restaurarBackup } from '@/lib/backup'

let pasta: string

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-'))
  process.env.ALMOXARIFADO_DATA_DIR = pasta
})

afterEach(() => {
  fecharBanco()
  fs.rmSync(pasta, { recursive: true, force: true })
})

const produto = (nome = 'Parafuso', quantidade = 10) => repo.criarProduto({ nome, quantidade, minimo: 2 })
const estoque = (id: number) => repo.listarProdutos().find(p => p.id === id)!

describe('produtos', () => {
  it('cria com estoque inicial e registra a movimentação', () => {
    const id = produto()
    expect(estoque(id).quantidade_atual).toBe(10)
    const [mov] = repo.listarMovimentacoes()
    expect(mov).toMatchObject({ produto_id: id, tipo: 'ENTRADA', origem: 'ESTOQUE_INICIAL', unidade: 'UN' })
  })

  it('salva a categoria escolhida', () => {
    const categoria = repo.listarCategorias().find(c => c.nome === 'Elétrica')!
    const id = repo.criarProduto({ nome: 'Fita', categoria_id: categoria.id })
    expect(estoque(id).categoria).toBe('Elétrica')
  })

  it('aceita estoque mínimo zero e rejeita valores inválidos', () => {
    const id = repo.criarProduto({ nome: 'Luva', minimo: 0 })
    expect(estoque(id).estoque_minimo).toBe(0)
    expect(() => repo.criarProduto({ nome: '' })).toThrow('Nome é obrigatório')
    expect(() => repo.criarProduto({ nome: 'X', quantidade: -1 })).toThrow('Quantidade inicial inválida')
    expect(() => repo.criarProduto({ nome: 'luva' })).toThrow('Já existe')
  })
})

describe('entradas', () => {
  it('soma ao estoque', () => {
    const id = produto()
    repo.registrarEntrada({ produto_id: id, quantidade: 5 })
    expect(estoque(id).quantidade_atual).toBe(15)
  })

  it('rejeita quantidade inválida', () => {
    const id = produto()
    expect(() => repo.registrarEntrada({ produto_id: id, quantidade: 0 })).toThrow()
    expect(() => repo.registrarEntrada({ produto_id: id, quantidade: 'abc' })).toThrow()
  })
})

describe('requisições', () => {
  it('baixa o estoque e gera número sequencial', () => {
    const id = produto()
    const reqId = repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: id, quantidade: 3 }] })
    const req = repo.obterRequisicao(reqId)
    expect(req.numero).toMatch(/^REQ-\d{4}-000001$/)
    expect(req.itens).toHaveLength(1)
    expect(estoque(id).quantidade_atual).toBe(7)
  })

  it('consolida itens repetidos antes de validar o disponível', () => {
    const id = produto('Cabo', 5)
    expect(() => repo.criarRequisicao({
      retirado_por: 'Ana',
      itens: [{ produto_id: id, quantidade: 3 }, { produto_id: id, quantidade: 3 }]
    })).toThrow('Quantidade indisponível')
    expect(estoque(id).quantidade_atual).toBe(5)
  })

  it('é atômica: nada é gravado se um item falhar', () => {
    const a = produto('A', 10)
    const b = produto('B', 1)
    expect(() => repo.criarRequisicao({
      retirado_por: 'Ana',
      itens: [{ produto_id: a, quantidade: 2 }, { produto_id: b, quantidade: 5 }]
    })).toThrow()
    expect(estoque(a).quantidade_atual).toBe(10)
    expect(repo.listarRequisicoes()).toHaveLength(0)
  })

  it('exige nome e materiais', () => {
    const id = produto()
    expect(() => repo.criarRequisicao({ retirado_por: ' ', itens: [{ produto_id: id, quantidade: 1 }] })).toThrow()
    expect(() => repo.criarRequisicao({ retirado_por: 'Ana', itens: [] })).toThrow()
  })
})

describe('reservas', () => {
  it('bloqueia a quantidade para retiradas comuns sem baixar o estoque físico', () => {
    const id = produto()
    repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: id, quantidade: 8 }] })
    const p = estoque(id)
    expect(p.quantidade_atual).toBe(10)
    expect(p.quantidade_reservada).toBe(8)
    expect(p.quantidade_disponivel).toBe(2)
    expect(() => repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: id, quantidade: 3 }] })).toThrow()
  })

  it('segue o ciclo separado → aguardando → retirado', () => {
    const id = produto()
    const resId = repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: id, quantidade: 4 }] })
    repo.atualizarStatusReserva(resId, 'AGUARDANDO_RETIRADA')
    const reqId = repo.retirarReserva(resId, 'Bruno')
    expect(repo.obterReserva(resId).status).toBe('RETIRADO')
    expect(repo.obterRequisicao(reqId).reserva_numero).toMatch(/^RES-/)
    const p = estoque(id)
    expect(p.quantidade_atual).toBe(6)
    expect(p.quantidade_reservada).toBe(0)
    expect(() => repo.retirarReserva(resId, 'Bruno')).toThrow('já encerrada')
  })

  it('cancelar libera o material', () => {
    const id = produto()
    const resId = repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: id, quantidade: 10 }] })
    repo.cancelarReserva(resId)
    expect(estoque(id).quantidade_disponivel).toBe(10)
    expect(() => repo.cancelarReserva(resId)).toThrow()
  })

  it('rejeita status inválido', () => {
    const id = produto()
    const resId = repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: id, quantidade: 1 }] })
    expect(() => repo.atualizarStatusReserva(resId, 'RETIRADO')).toThrow('Status inválido')
  })
})

describe('migração de banco antigo', () => {
  it('converte status legados de reservas', () => {
    const arquivo = path.join(pasta, 'almoxarifado.db')
    const antigo = new Database(arquivo)
    antigo.exec(`
      CREATE TABLE reservas (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, finalidade TEXT NOT NULL,
        reservado_por TEXT, observacao TEXT, status TEXT NOT NULL DEFAULT 'RESERVADA' CHECK (status IN ('RESERVADA','RETIRADA','CANCELADA')),
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO reservas (numero, finalidade, status) VALUES ('RES-1','A','RESERVADA'),('RES-2','B','RETIRADA'),('RES-3','C','CANCELADA');
    `)
    antigo.close()
    expect(repo.listarReservas().map(r => r.status).sort()).toEqual(['CANCELADO', 'RETIRADO', 'SEPARADO'])
  })
})

describe('backup', () => {
  it('cria, lista e restaura um backup', () => {
    const id = produto('Martelo', 3)
    const arquivo = criarBackup('teste')
    expect(listarBackups().map(b => b.nome)).toContain(path.basename(arquivo))

    repo.registrarEntrada({ produto_id: id, quantidade: 100 })
    expect(estoque(id).quantidade_atual).toBe(103)

    const r = restaurarBackup(fs.readFileSync(arquivo))
    expect(r.backupAnterior).toMatch(/antes-da-restauracao/)
    expect(estoque(id).quantidade_atual).toBe(3)
  })

  it('recusa arquivos que não são backups válidos', () => {
    produto()
    expect(() => restaurarBackup(Buffer.from('isto não é um banco'))).toThrow()
    const outro = path.join(pasta, 'outro.db')
    new Database(outro).exec('CREATE TABLE x (id INTEGER)')
    expect(() => restaurarBackup(fs.readFileSync(outro))).toThrow('não é um backup')
    expect(repo.listarProdutos()).toHaveLength(1)
  })

  it('faz apenas um backup automático por dia', () => {
    getDb()
    expect(backupAutomaticoDiario()).not.toBeNull()
    expect(backupAutomaticoDiario()).toBeNull()
  })
})
