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

describe('nota fiscal em XML (NF-e)', () => {
  it('lê número, emitente, data e itens com ponto decimal, entidades e CDATA', async () => {
    const doc = await lerDocumento(fixture('nfe.xml'), 'NFe351.xml')
    expect(doc).toMatchObject({ tipo: 'nfe', formato: 'xml', numero: '1234', fornecedor: 'CONSTRUFORTE MATERIAIS DE CONSTRUÇÃO LTDA', data: '08/10/2024', avisos: [] })
    expect(doc.itens.map(({ sugestao, ...i }) => i)).toEqual([
      { codigo: 'CIM-001', descricao: 'CIMENTO PORTLAND CP II-E-32 SACO 50KG', unidade: 'SC', quantidade: 40, valor_unitario: 38.9 },
      { codigo: 'TIJ-8F', descricao: 'TIJOLO CERÂMICO 8 FUROS 9X19X19 & AMARRAÇÃO', unidade: 'MIL', quantidade: 2, valor_unitario: 950 },
      { codigo: 'ARE-M', descricao: 'AREIA MÉDIA LAVADA', unidade: 'M³', quantidade: 6.5, valor_unitario: 120 }
    ])
  })

  it('aceita prefixo de namespace e recusa XML que não é NF-e completa', async () => {
    const comPrefixo = '<nfe:NFe xmlns:nfe="x"><nfe:infNFe><nfe:ide><nfe:nNF>9</nfe:nNF><nfe:dEmi>2023-01-05</nfe:dEmi></nfe:ide><nfe:det nItem="1"><nfe:prod><nfe:xProd>LUVA</nfe:xProd><nfe:uCom>PAR</nfe:uCom><nfe:qCom>3</nfe:qCom></nfe:prod></nfe:det></nfe:infNFe></nfe:NFe>'
    const doc = await lerDocumento(Buffer.from(comPrefixo), 'nota.XML')
    expect(doc).toMatchObject({ numero: '9', data: '05/01/2023', itens: [{ descricao: 'LUVA', unidade: 'PAR', quantidade: 3 }] })
    await expect(lerDocumento(Buffer.from('<resNFe><chNFe>1</chNFe></resNFe>'), 'r.xml')).rejects.toThrow('resumo da nota')
    await expect(lerDocumento(Buffer.from('<pedido/>'), 'p.xml')).rejects.toThrow('não é de uma nota fiscal')
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
    await expect(lerDocumento(Buffer.from('x'), 'foto.jpg')).rejects.toThrow('Envie um arquivo PDF')
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
    expect(r).toEqual({ criados: 1, entradas: 2, ajustados: 0, iguais: 0 })
    const produtos = repo.listarProdutos()
    expect(produtos.find(p => p.id === cimento)?.quantidade_atual).toBe(50)
    expect(produtos.find(p => p.nome === 'Areia média lavada')).toMatchObject({ codigo: 'AR-MED', unidade: 'M³', quantidade_atual: 6.5 })
    const [mov] = repo.listarMovimentacoes()
    expect(mov).toMatchObject({ origem: 'IMPORTACAO', observacao: 'NF-e 12345 · Santa Luzia', responsavel: 'Carlos' })
  })

  it('modo cadastro cria os materiais sem mexer no estoque', () => {
    const r = repo.aplicarImportacao({ modo: 'cadastro', itens: [{ nome: 'Prego 17x27', unidade: 'KG', quantidade: 5 }] })
    expect(r).toEqual({ criados: 1, entradas: 0, ajustados: 0, iguais: 0 })
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

  it('modo atualizar: o arquivo tem o estoque de hoje e a diferença vira entrada ou saída', () => {
    const cimento = repo.criarProduto({ nome: 'Cimento', unidade: 'SC', quantidade: 10 })
    const areia = repo.criarProduto({ nome: 'Areia', unidade: 'M³', quantidade: 8 })
    const prego = repo.criarProduto({ nome: 'Prego', unidade: 'KG', quantidade: 3 })
    const r = repo.aplicarImportacao({
      modo: 'atualizar',
      observacao: 'Contagem de outubro',
      responsavel: 'Carlos',
      itens: [
        { produto_id: cimento, quantidade: 25 },
        { produto_id: areia, quantidade: 2 },
        { produto_id: areia, quantidade: 1 },
        { produto_id: prego, quantidade: 3 },
        { nome: 'Tijolo', unidade: 'UN', quantidade: 500 }
      ]
    })
    expect(r).toEqual({ criados: 1, entradas: 0, ajustados: 2, iguais: 1 })
    const estoque = Object.fromEntries(repo.listarProdutos().map(p => [p.nome, p.quantidade_atual]))
    expect(estoque).toEqual({ Areia: 3, Cimento: 25, Prego: 3, Tijolo: 500 })
    const movs = repo.listarMovimentacoes().filter(m => m.origem === 'AJUSTE')
    expect(movs.map(m => [m.produto_nome, m.tipo, m.quantidade]).sort()).toEqual([['Areia', 'SAIDA', 5], ['Cimento', 'ENTRADA', 15]])
    expect(movs[0]).toMatchObject({ observacao: 'Contagem de outubro', responsavel: 'Carlos' })
  })

  it('modo atualizar aceita zero, recusa quantidade vazia e não passa por cima de reserva', () => {
    const cabo = repo.criarProduto({ nome: 'Cabo', quantidade: 10 })
    repo.aplicarImportacao({ modo: 'atualizar', itens: [{ produto_id: cabo, quantidade: 0 }] })
    expect(repo.listarProdutos()[0].quantidade_atual).toBe(0)
    expect(() => repo.aplicarImportacao({ modo: 'atualizar', itens: [{ produto_id: cabo, quantidade: null }] })).toThrow('Item 1: informe a quantidade')
    const fita = repo.criarProduto({ nome: 'Fita', quantidade: 10 })
    repo.criarReserva({ finalidade: 'Obra', itens: [{ produto_id: fita, quantidade: 6 }] })
    expect(() => repo.aplicarImportacao({ modo: 'atualizar', itens: [{ produto_id: fita, nome: 'Fita', quantidade: 2 }] })).toThrow('Item 1 (Fita): Há 6')
    expect(repo.listarProdutos().find(p => p.id === fita)?.quantidade_atual).toBe(10)
  })
})
