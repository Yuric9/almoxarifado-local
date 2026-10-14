import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import writeXlsxFile from 'write-excel-file/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fecharBanco } from '@/lib/db'
import * as repo from '@/lib/repository'
import { itensDeTabela, lerDocumento, normalizarUnidade } from '@/lib/documento'

const fixture = (nome: string) => fs.readFileSync(path.join(__dirname, 'fixtures', nome))
let pasta: string

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-doc-'))
  process.env.ALMOXARIFADO_DATA_DIR = pasta
})

afterEach(() => {
  fecharBanco()
  fs.rmSync(pasta, { recursive: true, force: true })
})

describe('nota fiscal (DANFE) em PDF', () => {
  it('lê número, fornecedor, data e itens com descrição em várias linhas', async () => {
    const doc = await lerDocumento(fixture('danfe.pdf'), 'nota.pdf')
    expect(doc).toMatchObject({ tipo: 'nfe', formato: 'pdf', numero: '12345', fornecedor: 'MATERIAIS DE CONSTRUÇÃO SANTA LUZIA LTDA', data: '10/10/2026' })
    expect(doc.itens.map(i => [i.codigo, i.descricao, i.unidade, i.quantidade, i.valor_unitario])).toEqual([
      ['7891', 'TIJOLO CERAMICO FURADO 8F 9X19X19', 'MIL', 2, 890],
      ['4402', 'CIMENTO PORTLAND CP II-E-32 SACO 50KG MARCA FORTE', 'SC', 40, 38.5],
      ['AR-MED', 'AREIA MEDIA LAVADA', 'M³', 6.5, 120],
      ['12055', 'FITA ISOLANTE 19MMX20M PRETA ANTICHAMA', 'UN', 24, 6.9]
    ])
  })

  it('sugere o material cadastrado pelo código ou por nome parecido', async () => {
    const cimento = repo.criarProduto({ nome: 'Cimento CP II 50kg', unidade: 'SC' })
    const fita = repo.criarProduto({ nome: 'Fita isolante', codigo: '12055' })
    const doc = await lerDocumento(fixture('danfe.pdf'), 'nota.pdf')
    expect(doc.itens[1].sugestao).toMatchObject({ produto_id: cimento, motivo: 'semelhante' })
    expect(doc.itens[3].sugestao).toMatchObject({ produto_id: fita, motivo: 'codigo' })
    expect(doc.itens[0].sugestao).toBeNull()
  })
})

describe('tabelas', () => {
  it('lê um pedido em PDF pelas colunas do cabeçalho', async () => {
    const doc = await lerDocumento(fixture('pedido.pdf'), 'pedido.pdf')
    expect(doc.tipo).toBe('tabela')
    expect(doc.itens.map(i => [i.descricao, i.quantidade, i.unidade])).toEqual([
      ['Parafuso sextavado 1/4 x 2"', 500, 'UN'],
      ['Bucha nylon S8', 1000, 'UN'],
      ['Luva de raspa cano longo', 12, 'PAR']
    ])
  })

  it('lê a tabela de um documento Word', async () => {
    const doc = await lerDocumento(fixture('lista.docx'), 'lista.docx')
    expect(doc.itens.map(i => [i.codigo, i.descricao, i.unidade, i.quantidade])).toEqual([
      ['TJ-08', 'Tijolo furado 8 furos', 'UN', 2500],
      ['CM-50', 'Cimento CP-II 50kg', 'SC', 40],
      [null, 'Areia média lavada', 'M³', 6.5],
      ['VG-10', 'Vergalhão CA-50 10mm', 'BR', 120]
    ])
  })

  it('lê uma planilha Excel com o cabeçalho fora da primeira linha', async () => {
    const xlsx = await writeXlsxFile([
      [{ value: 'Requisição de compra' }],
      [],
      ['Descrição', 'Qtde', 'Und'].map(value => ({ value })),
      [{ value: 'Prego 17x27' }, { value: 5 }, { value: 'KG' }],
      [{ value: 'Total' }, { value: 5 }, null]
    ]).toBuffer()
    const doc = await lerDocumento(xlsx, 'compra.xlsx')
    expect(doc.itens).toEqual([expect.objectContaining({ descricao: 'Prego 17x27', quantidade: 5, unidade: 'KG' })])
  })

  it('reconhece variações de cabeçalho e unidades', () => {
    const itens = itensDeTabela([['Cód.', 'Material', 'Quant.', 'Unidade'], ['A1', 'Cola branca', '3', 'Litro']])
    expect(itens[0]).toMatchObject({ codigo: 'A1', descricao: 'Cola branca', quantidade: 3, unidade: 'L' })
    expect(normalizarUnidade('m3')).toBe('M³')
    expect(normalizarUnidade('Und')).toBe('UN')
  })
})

describe('erros claros', () => {
  it('recusa formatos não suportados e documentos sem lista', async () => {
    await expect(lerDocumento(Buffer.from('x'), 'antigo.doc')).rejects.toThrow('Formato antigo')
    await expect(lerDocumento(Buffer.from('x'), 'foto.jpg')).rejects.toThrow('PDF, Word')
    await expect(lerDocumento(Buffer.from('não é zip'), 'lista.docx')).rejects.toThrow('Word inválido')
    await expect(lerDocumento(Buffer.from('%PDF-1.4 lixo'), 'nota.pdf')).rejects.toThrow()
    const semTabela = await writeXlsxFile([[{ value: 'Olá' }], [{ value: 'mundo' }]]).toBuffer()
    await expect(lerDocumento(semTabela, 'vazio.xlsx')).rejects.toThrow('Não encontrei uma lista')
  })
})

describe('aplicar importação', () => {
  it('cria materiais novos e dá entrada nos existentes, com origem e observação', () => {
    const cimento = repo.criarProduto({ nome: 'Cimento CP II', unidade: 'SC', quantidade: 10 })
    const r = repo.aplicarImportacao({
      modo: 'entrada',
      observacao: 'NF-e 12345 · Santa Luzia',
      responsavel: 'Carlos',
      itens: [
        { produto_id: cimento, quantidade: 40 },
        { nome: 'Areia média lavada', codigo: 'AR-MED', unidade: 'M³', quantidade: 6.5 }
      ]
    })
    expect(r).toEqual({ criados: 1, entradas: 2 })
    const produtos = repo.listarProdutos()
    expect(produtos.find(p => p.id === cimento)?.quantidade_atual).toBe(50)
    expect(produtos.find(p => p.nome === 'Areia média lavada')).toMatchObject({ codigo: 'AR-MED', unidade: 'M³', quantidade_atual: 6.5 })
    const [mov] = repo.listarMovimentacoes()
    expect(mov).toMatchObject({ origem: 'IMPORTACAO', observacao: 'NF-e 12345 · Santa Luzia', responsavel: 'Carlos' })
  })

  it('modo cadastro cria os materiais sem mexer no estoque', () => {
    const r = repo.aplicarImportacao({ modo: 'cadastro', itens: [{ nome: 'Prego 17x27', unidade: 'KG', quantidade: 5 }] })
    expect(r).toEqual({ criados: 1, entradas: 0 })
    expect(repo.listarProdutos()[0].quantidade_atual).toBe(0)
  })

  it('é tudo ou nada e diz qual item falhou', () => {
    repo.criarProduto({ nome: 'Tijolo' })
    expect(() => repo.aplicarImportacao({
      modo: 'entrada',
      itens: [{ nome: 'Telha', quantidade: 10 }, { nome: 'Tijolo', quantidade: 5 }]
    })).toThrow('Item 2 (Tijolo): Já existe um material chamado "Tijolo"')
    expect(repo.listarProdutos().map(p => p.nome)).toEqual(['Tijolo'])
    expect(() => repo.aplicarImportacao({ modo: 'entrada', itens: [{ nome: 'Telha', quantidade: 0 }] })).toThrow('maior que zero')
    expect(() => repo.aplicarImportacao({ modo: 'x', itens: [{ nome: 'Telha' }] })).toThrow('Escolha')
  })
})
