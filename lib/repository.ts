import { db } from './db'

export type Produto = { id:number; nome:string; categoria_id:number|null; quantidade_atual:number; estoque_minimo:number; unidade:string; categoria:string|null }
export type Movimentacao = { id:number; produto_id:number; tipo:'ENTRADA'|'SAIDA'; quantidade:number; responsavel:string|null; observacao:string|null; criado_em:string; produto_nome:string }

export function listarProdutos(): Produto[] {
  return db.prepare(`
    SELECT p.*, c.nome AS categoria
    FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id
    ORDER BY p.nome
  `).all() as Produto[]
}

export function listarMovimentacoes(): Movimentacao[] {
  return db.prepare(`
    SELECT m.*, p.nome AS produto_nome
    FROM movimentacoes m JOIN produtos p ON p.id=m.produto_id
    ORDER BY m.criado_em DESC, m.id DESC LIMIT 100
  `).all() as Movimentacao[]
}

export function criarProduto(input:{nome:string; categoria_id:number|null; quantidade:number; minimo:number; unidade:string}) {
  const tx = db.transaction(() => {
    const result = db.prepare('INSERT INTO produtos (nome,categoria_id,quantidade_atual,estoque_minimo,unidade) VALUES (?,?,?,?,?)').run(input.nome,input.categoria_id,input.quantidade,input.minimo,input.unidade)
    if (input.quantidade > 0) db.prepare('INSERT INTO movimentacoes (produto_id,tipo,quantidade,observacao) VALUES (?,?,?,?)').run(result.lastInsertRowid,'ENTRADA',input.quantidade,'Estoque inicial')
    return Number(result.lastInsertRowid)
  })
  return tx()
}

export function registrarMovimentacao(input:{produto_id:number; tipo:'ENTRADA'|'SAIDA'; quantidade:number; responsavel?:string; observacao?:string}) {
  const tx = db.transaction(() => {
    const produto = db.prepare('SELECT quantidade_atual FROM produtos WHERE id=?').get(input.produto_id) as {quantidade_atual:number}|undefined
    if (!produto) throw new Error('Produto não encontrado')
    if (input.quantidade <= 0) throw new Error('Quantidade deve ser maior que zero')
    if (input.tipo === 'SAIDA' && produto.quantidade_atual < input.quantidade) throw new Error(`Estoque insuficiente. Disponível: ${produto.quantidade_atual}`)
    const delta = input.tipo === 'ENTRADA' ? input.quantidade : -input.quantidade
    db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual+? WHERE id=?').run(delta,input.produto_id)
    db.prepare('INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao) VALUES (?,?,?,?,?)').run(input.produto_id,input.tipo,input.quantidade,input.responsavel ?? null,input.observacao ?? null)
  })
  tx()
}
