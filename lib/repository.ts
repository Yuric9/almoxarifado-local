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

export function registrarMovimentacao(input:{produto_id:number; tipo:'ENTRADA'|'SAIDA'; quantidade:number; responsavel?:string; observacao?:string; requisicao_id?:number}) {
  const tx = db.transaction(() => {
    const produto = db.prepare('SELECT quantidade_atual FROM produtos WHERE id=?').get(input.produto_id) as {quantidade_atual:number}|undefined
    if (!produto) throw new Error('Produto não encontrado')
    if (input.quantidade <= 0) throw new Error('Quantidade deve ser maior que zero')
    if (input.tipo === 'SAIDA' && !input.requisicao_id) throw new Error('Toda saída de material deve estar vinculada a uma requisição de retirada')
    if (input.tipo === 'SAIDA' && input.quantidade > produto.quantidade_atual) throw new Error(`Estoque insuficiente. Disponível: ${produto.quantidade_atual}`)
    const delta = input.tipo === 'ENTRADA' ? input.quantidade : -input.quantidade
    db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual+? WHERE id=?').run(delta,input.produto_id)
    db.prepare('INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao) VALUES (?,?,?,?,?)').run(input.produto_id,input.tipo,input.quantidade,input.responsavel ?? null,input.observacao ?? null)
  })
  tx()
}


export function exportarBanco() {
  const row = db.prepare("PRAGMA database_list").get() as { file:string }
  return row.file
}

export function importarDados(dados: {categorias?: any[]; produtos?: any[]; movimentacoes?: any[]}) {
  const tx = db.transaction(() => {
    if (dados.categorias) {
      const insert = db.prepare('INSERT OR IGNORE INTO categorias (id,nome,cor) VALUES (?,?,?)')
      for (const c of dados.categorias) insert.run(c.id,c.nome,c.cor ?? '#2563EB')
    }
    if (dados.produtos) {
      const insert = db.prepare('INSERT OR REPLACE INTO produtos (id,nome,categoria_id,quantidade_atual,estoque_minimo,unidade,criado_em) VALUES (?,?,?,?,?,?,?)')
      for (const p of dados.produtos) insert.run(p.id,p.nome,p.categoria_id ?? null,p.quantidade_atual ?? 0,p.estoque_minimo ?? 5,p.unidade ?? 'UN',p.criado_em ?? new Date().toISOString())
    }
    if (dados.movimentacoes) {
      const insert = db.prepare('INSERT OR REPLACE INTO movimentacoes (id,produto_id,tipo,quantidade,responsavel,observacao,criado_em) VALUES (?,?,?,?,?,?,?)')
      for (const m of dados.movimentacoes) insert.run(m.id,m.produto_id,m.tipo,m.quantidade,m.responsavel ?? null,m.observacao ?? null,m.criado_em ?? new Date().toISOString())
    }
  })
  tx()
}


export type RequisicaoItemInput = { produto_id:number; quantidade:number }
export type RequisicaoInput = { retirado_por:string; setor?:string; finalidade?:string; entregue_por?:string; observacao?:string; itens:RequisicaoItemInput[] }

export function listarRequisicoes() {
  return db.prepare(`
    SELECT r.*, COUNT(ri.id) AS total_itens
    FROM requisicoes r LEFT JOIN requisicao_itens ri ON ri.requisicao_id=r.id
    GROUP BY r.id ORDER BY r.id DESC LIMIT 200
  `).all() as any[]
}

export function obterRequisicao(id:number) {
  const requisicao = db.prepare('SELECT * FROM requisicoes WHERE id=?').get(id) as any
  if (!requisicao) throw new Error('Requisição não encontrada')
  const itens = db.prepare(`SELECT ri.*, p.quantidade_atual AS estoque_atual FROM requisicao_itens ri JOIN produtos p ON p.id=ri.produto_id WHERE ri.requisicao_id=? ORDER BY ri.id`).all(id)
  return { ...requisicao, itens }
}

export function criarRequisicao(input:RequisicaoInput) {
  const tx = db.transaction(() => {
    const nome = input.retirado_por?.trim()
    if (!nome) throw new Error('Nome de quem retirou é obrigatório')
    if (!input.itens?.length) throw new Error('Adicione pelo menos um material')
    const numero = `REQ-${new Date().getFullYear()}-${String((db.prepare('SELECT COALESCE(MAX(id),0)+1 AS proximo FROM requisicoes').get() as any).proximo).padStart(6,'0')}`
    const req = db.prepare('INSERT INTO requisicoes (numero,retirado_por,setor,finalidade,entregue_por,observacao) VALUES (?,?,?,?,?,?)').run(numero,nome,input.setor?.trim()||null,input.finalidade?.trim()||null,input.entregue_por?.trim()||null,input.observacao?.trim()||null)
    const requisicaoId = Number(req.lastInsertRowid)
    const produtoStmt = db.prepare('SELECT id,nome,unidade,quantidade_atual FROM produtos WHERE id=?')
    const update = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual-? WHERE id=?')
    const mov = db.prepare('INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao) VALUES (?,?,?,?,?)')
    const item = db.prepare('INSERT INTO requisicao_itens (requisicao_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)')
    for (const entrada of input.itens) {
      const quantidade = Number(entrada.quantidade)
      const produto = produtoStmt.get(entrada.produto_id) as any
      if (!produto) throw new Error('Produto não encontrado')
      if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error('Quantidade inválida')
      if (produto.quantidade_atual < quantidade) throw new Error(`Estoque insuficiente para ${produto.nome}. Disponível: ${produto.quantidade_atual}`)
      update.run(quantidade, produto.id)
      item.run(requisicaoId,produto.id,quantidade,produto.unidade,produto.nome)
      mov.run(produto.id,'SAIDA',quantidade,nome,`Requisição ${numero}${input.finalidade ? ' - '+input.finalidade : ''}`)
    }
    return requisicaoId
  })
  return tx()
}
