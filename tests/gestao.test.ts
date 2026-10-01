import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fecharBanco, getDb } from '@/lib/db'
import * as repo from '@/lib/repository'
import { lerConfiguracoes, salvarConfiguracoes } from '@/lib/configuracoes'
import { exportarMateriaisCsv, exportarMateriaisXlsx, importarMateriais, lerArquivoPlanilha, lerCsv, numeroCelula } from '@/lib/planilha'
import { relatorioPeriodo } from '@/lib/relatorios'

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
const hoje = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

describe('categorias', () => {
  it('cria, renomeia e impede duplicadas', () => {
    const id = repo.criarCategoria({ nome: 'Pintura', cor: '#AA00FF' })
    expect(repo.listarCategorias().map(c => c.nome)).toContain('Pintura')
    expect(() => repo.criarCategoria({ nome: 'pintura' })).toThrow('já existe')
    repo.atualizarCategoria(id, { nome: 'Tintas' })
    expect(repo.listarCategorias().find(c => c.id === id)?.nome).toBe('Tintas')
  })

  it('não exclui categoria em uso', () => {
    const id = repo.criarCategoria({ nome: 'Pintura' })
    repo.criarProduto({ nome: 'Rolo', categoria_id: id })
    expect(() => repo.excluirCategoria(id)).toThrow('usam esta categoria')
    const livre = repo.criarCategoria({ nome: 'Vazia' })
    repo.excluirCategoria(livre)
    expect(repo.listarCategorias().some(c => c.id === livre)).toBe(false)
  })
})

describe('cadastro de material', () => {
  it('edita dados sem alterar a quantidade', () => {
    const id = produto()
    repo.atualizarProduto(id, { nome: 'Parafuso 6mm', codigo: 'P-6', localizacao: 'A1', minimo: 4, unidade: 'cx' })
    expect(estoque(id)).toMatchObject({ nome: 'Parafuso 6mm', codigo: 'P-6', localizacao: 'A1', estoque_minimo: 4, unidade: 'CX', quantidade_atual: 10 })
  })

  it('impede código duplicado', () => {
    repo.criarProduto({ nome: 'A', codigo: 'X1' })
    expect(() => repo.criarProduto({ nome: 'B', codigo: 'x1' })).toThrow('código')
  })

  it('material inativo não pode ser retirado', () => {
    const id = produto()
    repo.definirProdutoAtivo(id, false)
    expect(() => repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: id, quantidade: 1 }] })).toThrow('inativo')
    repo.definirProdutoAtivo(id, true)
    expect(() => repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: id, quantidade: 1 }] })).not.toThrow()
  })

  it('só exclui material sem histórico', () => {
    const novo = produto('Novo', 5)
    repo.excluirProduto(novo)
    expect(repo.listarProdutos()).toHaveLength(0)
    const usado = produto('Usado', 5)
    repo.registrarEntrada({ produto_id: usado, quantidade: 1 })
    expect(() => repo.excluirProduto(usado)).toThrow('Inativar')
  })

  it('usa o estoque mínimo padrão das configurações', () => {
    salvarConfiguracoes({ estoque_minimo_padrao: 12 })
    const id = repo.criarProduto({ nome: 'Cola' })
    expect(estoque(id).estoque_minimo).toBe(12)
  })

  it('ficha traz histórico e reservas abertas', () => {
    const id = produto()
    repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: id, quantidade: 3 }] })
    const ficha = repo.obterProduto(id)
    expect(ficha.movimentacoes).toHaveLength(1)
    expect(ficha.reservas).toHaveLength(1)
  })
})

describe('baixas e ajustes', () => {
  it('baixa por perda registra motivo e reduz o estoque', () => {
    const id = produto()
    repo.registrarBaixa({ produto_id: id, quantidade: 3, motivo: 'QUEBRADO', responsavel: 'Ana' })
    expect(estoque(id).quantidade_atual).toBe(7)
    expect(repo.listarMovimentacoes()[0]).toMatchObject({ tipo: 'SAIDA', origem: 'BAIXA', motivo: 'QUEBRADO' })
  })

  it('baixa não consome material reservado e exige motivo', () => {
    const id = produto()
    repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: id, quantidade: 8 }] })
    expect(() => repo.registrarBaixa({ produto_id: id, quantidade: 3, motivo: 'PERDA' })).toThrow('reservado')
    expect(() => repo.registrarBaixa({ produto_id: id, quantidade: 1, motivo: 'XYZ' })).toThrow('motivo')
    expect(() => repo.registrarBaixa({ produto_id: id, quantidade: 1, motivo: 'OUTRO' })).toThrow('Descreva')
  })

  it('ajuste de inventário lança a diferença para cima e para baixo', () => {
    const id = produto()
    expect(repo.ajustarEstoque({ produto_id: id, quantidade_contada: 13 })).toBe(3)
    expect(estoque(id).quantidade_atual).toBe(13)
    expect(repo.ajustarEstoque({ produto_id: id, quantidade_contada: 9 })).toBe(-4)
    expect(estoque(id).quantidade_atual).toBe(9)
    expect(() => repo.ajustarEstoque({ produto_id: id, quantidade_contada: 9 })).toThrow('igual')
  })
})

describe('estorno de retirada', () => {
  it('devolve o material e marca a requisição como cancelada', () => {
    const id = produto()
    const req = repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: id, quantidade: 4 }] })
    expect(() => repo.estornarRequisicao(req, '')).toThrow('motivo')
    repo.estornarRequisicao(req, 'Lançada em duplicidade')
    expect(estoque(id).quantidade_atual).toBe(10)
    expect(repo.obterRequisicao(req)).toMatchObject({ status: 'CANCELADA', motivo_cancelamento: 'Lançada em duplicidade' })
    expect(() => repo.estornarRequisicao(req, 'de novo')).toThrow('já estornada')
  })
})

describe('edição de reserva', () => {
  it('troca itens respeitando o disponível', () => {
    const a = produto('A', 10)
    const b = produto('B', 5)
    const res = repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: a, quantidade: 8 }] })
    repo.atualizarReserva(res, { finalidade: 'Obra 2', reservado_por: 'Bia', itens: [{ produto_id: a, quantidade: 10 }, { produto_id: b, quantidade: 2 }] })
    const r = repo.obterReserva(res)
    expect(r.finalidade).toBe('Obra 2')
    expect(r.itens.map(i => i.quantidade)).toEqual([10, 2])
    expect(estoque(a).quantidade_disponivel).toBe(0)
    expect(() => repo.atualizarReserva(res, { finalidade: 'X', itens: [{ produto_id: b, quantidade: 6 }] })).toThrow('disponível')
    expect(repo.obterReserva(res).itens).toHaveLength(2)
  })

  it('não edita reserva encerrada', () => {
    const a = produto()
    const res = repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: a, quantidade: 1 }] })
    repo.cancelarReserva(res)
    expect(() => repo.atualizarReserva(res, { finalidade: 'X', itens: [{ produto_id: a, quantidade: 1 }] })).toThrow('abertas')
  })
})

describe('configurações', () => {
  it('lê padrões e salva valores válidos', () => {
    expect(lerConfiguracoes().tema).toBe('sistema')
    const c = salvarConfiguracoes({ empresa_nome: ' Construtora XYZ ', tema: 'escuro', backups_manter: 30 })
    expect(c).toMatchObject({ empresa_nome: 'Construtora XYZ', tema: 'escuro', backups_manter: 30 })
    expect(() => salvarConfiguracoes({ tema: 'roxo' })).toThrow()
    expect(() => salvarConfiguracoes({ backups_manter: 0 })).toThrow()
  })
})

describe('planilhas', () => {
  it('interpreta números em formato brasileiro', () => {
    expect(numeroCelula('1.234,5')).toBe(1234.5)
    expect(numeroCelula('10.5')).toBe(10.5)
    expect(numeroCelula('1.000')).toBe(1000)
    expect(numeroCelula('12.500.000')).toBe(12500000)
    expect(numeroCelula(7)).toBe(7)
    expect(numeroCelula('')).toBeNull()
    expect(() => numeroCelula('abc')).toThrow()
  })

  it('lê CSV com ponto e vírgula e aspas', () => {
    expect(lerCsv('﻿Nome;Obs\r\n"Cabo; 2,5mm";"diz ""oi"""\r\n')).toEqual([['Nome', 'Obs'], ['Cabo; 2,5mm', 'diz "oi"']])
  })

  it('importa novos, atualiza existentes e informa erros por linha', () => {
    const existente = produto('Tijolo', 10)
    const r = importarMateriais([
      ['Código', 'Material', 'Categoria', 'Unidade', 'Mínimo', 'Quantidade'],
      ['T-1', 'Tijolo', 'Alvenaria', 'UN', '20', '15'],
      ['C-1', 'Cimento', 'Alvenaria', 'KG', '5', '1.000'],
      ['', '', '', '', '', ''],
      ['X', 'Areia', '', '', 'abc', '']
    ])
    expect(r).toMatchObject({ criados: 1, atualizados: 1, ajustados: 0 })
    expect(r.erros.map(e => e.linha)).toEqual([4, 5])
    expect(estoque(existente)).toMatchObject({ codigo: 'T-1', categoria: 'Alvenaria', estoque_minimo: 20, quantidade_atual: 10 })
    expect(repo.listarProdutos().find(p => p.nome === 'Cimento')?.quantidade_atual).toBe(1000)
  })

  it('ajusta a quantidade de existentes só quando pedido', () => {
    const id = produto('Tijolo', 10)
    importarMateriais([['Nome', 'Quantidade'], ['Tijolo', 25]], { ajustarQuantidade: true })
    expect(estoque(id).quantidade_atual).toBe(25)
    expect(repo.listarMovimentacoes()[0]).toMatchObject({ origem: 'AJUSTE' })
  })

  it('exige a coluna Nome', () => {
    expect(() => importarMateriais([['Código'], ['A']])).toThrow('Nome')
  })

  it('exporta e reimporta o mesmo arquivo xlsx', async () => {
    repo.criarProduto({ nome: 'Cabo 2,5mm', codigo: 'CB-25', quantidade: 100, unidade: 'M', localizacao: 'B2' })
    const xlsx = await exportarMateriaisXlsx()
    expect(xlsx.subarray(0, 2).toString()).toBe('PK')
    expect(exportarMateriaisCsv()).toContain('CB-25;Cabo 2,5mm;;M;5;B2;100;0;100;Sim')
    const linhas = await lerArquivoPlanilha(xlsx, 'materiais.xlsx')
    expect(linhas[1][1]).toBe('Cabo 2,5mm')
    const r = importarMateriais(linhas)
    expect(r).toMatchObject({ criados: 0, atualizados: 1, erros: [] })
  })
})

describe('relatórios', () => {
  it('resume entradas, saídas, baixas e saldos do período', () => {
    const id = produto('Areia', 10)
    repo.registrarEntrada({ produto_id: id, quantidade: 5 })
    repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: id, quantidade: 3 }] })
    repo.registrarBaixa({ produto_id: id, quantidade: 2, motivo: 'PERDA' })
    const r = relatorioPeriodo(hoje(), hoje())
    expect(r.resumo).toMatchObject({ retiradas: 1, baixas: 1, saidas: 1, entradas: 2 })
    expect(r.materiais[0]).toMatchObject({ saldo_inicial: 0, entradas: 15, saidas: 3, baixas: 2, saldo_final: 10 })
    expect(r.dias).toHaveLength(1)
    expect(r.dias[0]).toMatchObject({ entradas: 2, saidas: 1, baixas: 1, retiradas: 1 })
  })

  it('período anterior ao cadastro mostra saldo zero e nada movimentado', () => {
    produto('Areia', 10)
    getDb()
    const r = relatorioPeriodo('2020-01-01', '2020-01-31')
    expect(r.resumo.movimentacoes).toBe(0)
    expect(r.materiais).toHaveLength(0)
    expect(() => relatorioPeriodo('2020-02-01', '2020-01-01')).toThrow()
  })
})

describe('atualização da versão anterior', () => {
  it('abre um banco da v1.1.0 sem perder dados e com as colunas novas', () => {
    const antigo = new Database(path.join(pasta, 'almoxarifado.db'))
    antigo.exec(`
      CREATE TABLE categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE, cor TEXT DEFAULT '#2563EB');
      CREATE TABLE produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, categoria_id INTEGER REFERENCES categorias(id),
        quantidade_atual REAL NOT NULL DEFAULT 0, estoque_minimo REAL NOT NULL DEFAULT 5, unidade TEXT NOT NULL DEFAULT 'UN',
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE movimentacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SAIDA')), quantidade REAL NOT NULL CHECK (quantidade > 0), responsavel TEXT, observacao TEXT,
        requisicao_id INTEGER, origem TEXT NOT NULL DEFAULT 'MANUAL', criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE requisicoes (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, retirado_por TEXT NOT NULL, setor TEXT,
        finalidade TEXT, entregue_por TEXT, observacao TEXT, reserva_id INTEGER,
        status TEXT NOT NULL DEFAULT 'FINALIZADA' CHECK (status IN ('FINALIZADA','CANCELADA')), criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO categorias (nome) VALUES ('Geral');
      INSERT INTO produtos (nome, categoria_id, quantidade_atual) VALUES ('TIJOLO FURADO 8F', 1, 999000);
      INSERT INTO movimentacoes (produto_id, tipo, quantidade, origem) VALUES (1, 'ENTRADA', 999000, 'ESTOQUE_INICIAL');
    `)
    antigo.close()
    const [p] = repo.listarProdutos()
    expect(p).toMatchObject({ nome: 'TIJOLO FURADO 8F', quantidade_atual: 999000, ativo: 1, codigo: null, categoria: 'Geral' })
    repo.registrarBaixa({ produto_id: p.id, quantidade: 10, motivo: 'QUEBRADO' })
    const req = repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: p.id, quantidade: 5 }] })
    repo.estornarRequisicao(req, 'teste')
    expect(estoque(p.id).quantidade_atual).toBe(998990)
  })
})
