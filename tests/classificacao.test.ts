import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fecharBanco } from '@/lib/db'
import * as repo from '@/lib/repository'
import { aplicarClassificacao, classificarMateriais, classificarNome, nomeCanonico, separarUnidade } from '@/lib/classificacao'
import { importarMateriais } from '@/lib/planilha'

let pasta: string

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-'))
  process.env.ALMOXARIFADO_DATA_DIR = pasta
})

afterEach(() => {
  fecharBanco()
  fs.rmSync(pasta, { recursive: true, force: true })
})

const categoriaDe = (id: number) => repo.listarProdutos().find(p => p.id === id)!

describe('sugestão pelo nome', () => {
  it('usa a tabela AGETOP para material de obra, elétrico e hidráulico', () => {
    expect(classificarNome('TIJOLO FURADO 9X14X29 6 FUROS')).toMatchObject({
      categoria: 'Construção civil', nova: true, confianca: 'alta', motivo: 'tabela', referencia: { codigo: '2710' }
    })
    expect(classificarNome('Disjuntor monopolar 20A')).toMatchObject({ categoria: 'Elétrica', nova: false, confianca: 'alta' })
    expect(classificarNome('Registro gaveta com acabamento cromado 3/4')).toMatchObject({ categoria: 'Hidráulica', confianca: 'alta' })
  })

  it('entende erros de digitação e nomes populares', () => {
    expect(classificarNome('ADITIVO PLASTICO P/ ARGMASSA 18 LTS')?.categoria).toBe('Construção civil')
    expect(classificarNome('ACABAMENTO VÁVULA DESCAGA PLASTICO')?.categoria).toBe('Hidráulica')
    expect(classificarNome('Cano PVC 25mm')?.categoria).toBe('Hidráulica')
  })

  it('usa palavras-chave para EPI, ferramentas e limpeza', () => {
    expect(classificarNome('BOTA DE SEGURANÇA COM BIQUEIRA DE AÇO')).toMatchObject({ categoria: 'EPI', motivo: 'palavra', confianca: 'alta' })
    expect(classificarNome('LUVA DE RASPA CANO CURTO')?.categoria).toBe('EPI')
    expect(classificarNome('Martelo unha 27mm')?.categoria).toBe('Ferramentas')
    expect(classificarNome('Detergente neutro 500ml')?.categoria).toBe('Limpeza')
  })

  it('só a primeira palavra igual não dá confiança alta', () => {
    expect(classificarNome('ROLO DE ESPUMA')?.confianca).toBe('baixa')
  })

  it('aprende com os materiais já classificados', () => {
    const ferramentas = repo.listarCategorias().find(c => c.nome === 'Ferramentas')!.id
    repo.criarProduto({ nome: 'Abraçadeira 260', categoria_id: ferramentas })
    repo.criarProduto({ nome: 'Abraçadeira 270', categoria_id: ferramentas })
    expect(classificarNome('Abraçadeira 300')).toMatchObject({ categoria: 'Ferramentas', motivo: 'semelhante', confianca: 'alta' })
  })

  it('não sugere nada para nomes sem relação', () => {
    expect(classificarNome('XYZW')).toBeNull()
  })
})

describe('categoria grudada na unidade', () => {
  it('separa a unidade do texto da categoria', () => {
    expect(separarUnidade('MATERIAL ELETRICO PAR')).toEqual({ unidade: 'PAR', categoria: 'MATERIAL ELETRICO' })
    expect(separarUnidade('CONSTRUÇÃO CIVIL UN')).toEqual({ unidade: 'UN', categoria: 'CONSTRUÇÃO CIVIL' })
    expect(separarUnidade('UN')).toEqual({ unidade: 'UN', categoria: null })
    expect(separarUnidade('M³')).toEqual({ unidade: 'M³', categoria: null })
  })

  it('reconhece apelidos das categorias', () => {
    expect(nomeCanonico('MATERIAL ELETRICO')).toBe('Elétrica')
    expect(nomeCanonico('material hidro-sanitário')).toBe('Hidráulica')
    expect(nomeCanonico('CONSTRUÇÃO CIVIL')).toBe('Construção civil')
    expect(nomeCanonico('ALMOXARIFADO GERAL')).toBe('Almoxarifado geral')
  })

  it('a planilha antiga já entra com unidade e categoria corretas', () => {
    importarMateriais([['Material', 'Unidade'], ['ABRAÇADEIRA 260', 'MATERIAL ELETRICO PAR'], ['ADITIVO SIKA', 'CONSTRUÇÃO CIVIL BL']])
    const [a, b] = repo.listarProdutos()
    expect(a).toMatchObject({ nome: 'ABRAÇADEIRA 260', unidade: 'PAR', categoria: 'Elétrica' })
    expect(b).toMatchObject({ nome: 'ADITIVO SIKA', unidade: 'BL', categoria: 'Construção civil' })
  })
})

describe('classificar materiais cadastrados', () => {
  it('lista os sem categoria, corrige a unidade e aplica tudo de uma vez', () => {
    const eletrica = repo.listarCategorias().find(c => c.nome === 'Elétrica')!.id
    const grudado = repo.criarProduto({ nome: 'ABRAÇADEIRA 260', unidade: 'MATERIAL ELETRICO PAR' })
    const tijolo = repo.criarProduto({ nome: 'Tijolo furado 9x14x29' })
    const pronto = repo.criarProduto({ nome: 'Cabo flexível 2,5mm', categoria_id: eletrica })

    const lista = classificarMateriais()
    expect(lista.map(i => i.produto_id)).toEqual([grudado, tijolo])
    expect(lista[0]).toMatchObject({ unidade_nova: 'PAR', sugestao: { categoria: 'Elétrica', motivo: 'unidade', nova: false } })
    expect(lista[1].sugestao).toMatchObject({ categoria: 'Construção civil', nova: true })

    const r = aplicarClassificacao({ itens: lista.map(i => ({ produto_id: i.produto_id, categoria: i.sugestao!.categoria, unidade: i.unidade_nova })) })
    expect(r).toEqual({ atualizados: 2, categorias_criadas: 1 })
    expect(categoriaDe(grudado)).toMatchObject({ unidade: 'PAR', categoria: 'Elétrica' })
    expect(categoriaDe(tijolo)).toMatchObject({ unidade: 'UN', categoria: 'Construção civil' })
    expect(categoriaDe(pronto).categoria).toBe('Elétrica')
    expect(classificarMateriais()).toEqual([])
  })

  it('no modo revisar, mostra só os que mudariam de categoria', () => {
    const geral = repo.listarCategorias().find(c => c.nome === 'Geral')!.id
    const eletrica = repo.listarCategorias().find(c => c.nome === 'Elétrica')!.id
    const errado = repo.criarProduto({ nome: 'Disjuntor monopolar 20A', categoria_id: geral })
    repo.criarProduto({ nome: 'Cabo flexível 2,5mm', categoria_id: eletrica })
    expect(classificarMateriais(true).map(i => [i.produto_id, i.categoria_atual, i.sugestao?.categoria])).toEqual([[errado, 'Geral', 'Elétrica']])
  })

  it('importação de documento com categoria automática', () => {
    repo.aplicarImportacao({ modo: 'cadastro', itens: [{ nome: 'Luva de raspa cano curto', categoria_id: 'auto' }, { nome: 'Coisa XYZW', categoria_id: 'auto' }] })
    const [coisa, luva] = repo.listarProdutos()
    expect(luva).toMatchObject({ nome: 'Luva de raspa cano curto', categoria: 'EPI' })
    expect(coisa.categoria).toBeNull()
  })
})

describe('juntar categorias', () => {
  it('renomear com o nome de outra junta as duas quando confirmado', () => {
    const repetida = repo.criarCategoria({ nome: 'MATERIAL ELETRICO' })
    const id = repo.criarProduto({ nome: 'Fita isolante', categoria_id: repetida })
    expect(() => repo.atualizarCategoria(repetida, { nome: 'elétrica' })).toThrow('já existe')
    repo.atualizarCategoria(repetida, { nome: 'Elétrica', juntar: true })
    expect(categoriaDe(id).categoria).toBe('Elétrica')
    expect(repo.listarCategorias().some(c => c.nome === 'MATERIAL ELETRICO')).toBe(false)
  })
})
