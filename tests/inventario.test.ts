import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb, fecharBanco } from '@/lib/db'
import * as repo from '@/lib/repository'
import * as inv from '@/lib/inventario'

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

describe('inventário completo', () => {
  it('conta, salva aos poucos e aplica só as diferenças, preservando o que mexeu no meio', () => {
    const cimento = repo.criarProduto({ nome: 'Cimento', quantidade: 50, localizacao: 'Galpão A' })
    const areia = repo.criarProduto({ nome: 'Areia', quantidade: 10, localizacao: 'Pátio' })
    const cal = repo.criarProduto({ nome: 'Cal', quantidade: 8 })
    const id = inv.iniciarInventario({ descricao: 'Inventário de outubro', responsavel: 'Carlos' })
    expect(() => inv.iniciarInventario({})).toThrow('em andamento')

    let v = inv.obterInventario(id)
    expect(v).toMatchObject({ numero: expect.stringMatching(/^INV-\d{4}-000001$/), escopo: 'Todos os materiais', total_itens: 3, contados: 0 })
    const item = (pid: number) => v.itens.find(i => i.produto_id === pid)!

    inv.salvarContagem(id, { contagens: [{ item_id: item(cimento).id, quantidade_contada: 47 }] })
    expect(inv.obterInventario(id).itens.every(i => !i.movimentado)).toBe(true)
    // retirada feita durante o inventário (depois da contagem)
    repo.criarRequisicao({ retirado_por: 'João', itens: [{ produto_id: cimento, quantidade: 2 }] })
    inv.salvarContagem(id, { contagens: [{ item_id: item(areia).id, quantidade_contada: '12' }, { item_id: item(cal).id, quantidade_contada: '' }] })

    v = inv.obterInventario(id)
    expect(v).toMatchObject({ contados: 2, divergentes: 2 })
    expect(item(cimento).movimentado).toBe(1)

    expect(inv.finalizarInventario(id)).toEqual({ ajustados: 2, nao_contados: 1 })
    // cimento: 50 − 2 (retirada) − 3 (diferença) = 45; areia: 10 + 2 = 12; cal não contada fica 8
    expect([estoque(cimento), estoque(areia), estoque(cal)]).toEqual([45, 12, 8])
    v = inv.obterInventario(id)
    expect(v.status).toBe('FINALIZADO')
    expect(item(cimento).ajuste).toBe(-3)
    expect(() => inv.salvarContagem(id, { contagens: [] })).toThrow('finalizado')
    const movs = getDb().prepare("SELECT tipo, quantidade, origem, motivo FROM movimentacoes WHERE inventario_id=? ORDER BY produto_id").all(id)
    expect(movs).toEqual([
      { tipo: 'SAIDA', quantidade: 3, origem: 'AJUSTE', motivo: 'INVENTARIO' },
      { tipo: 'ENTRADA', quantidade: 2, origem: 'AJUSTE', motivo: 'INVENTARIO' }
    ])
  })

  it('filtra por categoria e localização, bloqueia estoque negativo e permite cancelar', () => {
    const cat = repo.listarCategorias().find(c => c.nome === 'Elétrica')?.id ?? repo.criarCategoria({ nome: 'Elétrica' })
    const fio = repo.criarProduto({ nome: 'Fio 2,5mm', quantidade: 5, categoria_id: cat, localizacao: 'Prateleira B2' })
    repo.criarProduto({ nome: 'Tomada', quantidade: 5, categoria_id: cat, localizacao: 'Prateleira C1' })
    repo.criarProduto({ nome: 'Tijolo', quantidade: 100 })
    const id = inv.iniciarInventario({ categoria_id: cat, localizacao: 'b2' })
    const v = inv.obterInventario(id)
    expect(v.escopo).toBe('Categoria: Elétrica · Localização: b2')
    expect(v.itens.map(i => i.produto_nome)).toEqual(['Fio 2,5mm'])
    expect(() => inv.finalizarInventario(id)).toThrow('Nenhum material foi contado')

    inv.salvarContagem(id, { contagens: [{ item_id: v.itens[0].id, quantidade_contada: 0 }] })
    repo.criarRequisicao({ retirado_por: 'Ana', itens: [{ produto_id: fio, quantidade: 5 }] })
    expect(() => inv.finalizarInventario(id)).toThrow('negativo')
    inv.cancelarInventario(id)
    expect(inv.obterInventario(id).status).toBe('CANCELADO')
    expect(estoque(fio)).toBe(0)
    expect(() => inv.iniciarInventario({ localizacao: 'Lugar nenhum' })).toThrow('Nenhum material')
  })
})
