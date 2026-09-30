import { db } from './db'

const RESERVAS_ATIVAS = "'RESERVADA','SEPARADO','AGUARDANDO_RETIRADA'"

export type Produto = {
  id:number
  nome:string
  categoria_id:number|null
  quantidade_atual:number
  estoque_minimo:number
  unidade:string
  categoria:string|null
  quantidade_reservada:number
  quantidade_disponivel:number
}

export type Movimentacao = {
  id:number
  produto_id:number
  tipo:'ENTRADA'|'SAIDA'
  quantidade:number
  responsavel:string|null
  observacao:string|null
  requisicao_id:number|null
  origem:string
  criado_em:string
  produto_nome:string
}

export function listarProdutos(): Produto[] {
  return db.prepare(`
    SELECT p.*, c.nome AS categoria,
      COALESCE((
        SELECT SUM(ri.quantidade)
        FROM reserva_itens ri
        JOIN reservas r ON r.id=ri.reserva_id
        WHERE ri.produto_id=p.id AND r.status IN (${RESERVAS_ATIVAS})
      ),0) AS quantidade_reservada,
      p.quantidade_atual - COALESCE((
        SELECT SUM(ri.quantidade)
        FROM reserva_itens ri
        JOIN reservas r ON r.id=ri.reserva_id
        WHERE ri.produto_id=p.id AND r.status IN (${RESERVAS_ATIVAS})
      ),0) AS quantidade_disponivel
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
    const nome=input.nome.trim()
    if (!nome) throw new Error('Nome é obrigatório')
    if (input.quantidade < 0) throw new Error('Quantidade inicial inválida')
    const result = db.prepare(
      'INSERT INTO produtos (nome,categoria_id,quantidade_atual,estoque_minimo,unidade) VALUES (?,?,?,?,?)'
    ).run(nome,input.categoria_id,input.quantidade,input.minimo,input.unidade)
    if (input.quantidade > 0) {
      db.prepare(
        'INSERT INTO movimentacoes (produto_id,tipo,quantidade,observacao,origem) VALUES (?,?,?,?,?)'
      ).run(result.lastInsertRowid,'ENTRADA',input.quantidade,'Estoque inicial','ESTOQUE_INICIAL')
    }
    return Number(result.lastInsertRowid)
  })
  return tx()
}

export function registrarMovimentacao(input:{
  produto_id:number
  tipo:'ENTRADA'|'SAIDA'
  quantidade:number
  responsavel?:string
  observacao?:string
  requisicao_id?:number
  origem?:string
}) {
  const tx = db.transaction(() => {
    const produto = db.prepare('SELECT id,nome,unidade,quantidade_atual FROM produtos WHERE id=?')
      .get(input.produto_id) as {id:number;nome:string;unidade:string;quantidade_atual:number}|undefined
    if (!produto) throw new Error('Produto não encontrado')
    if (!Number.isFinite(input.quantidade) || input.quantidade <= 0) throw new Error('Quantidade deve ser maior que zero')

    if (input.tipo === 'SAIDA') {
      if (!input.requisicao_id) throw new Error('Toda saída de material deve estar vinculada a uma requisição de retirada')
      const reserva = db.prepare(`
        SELECT COALESCE(SUM(ri.quantidade),0) AS reservada
        FROM reserva_itens ri
        JOIN reservas r ON r.id=ri.reserva_id
        WHERE ri.produto_id=? AND r.status IN (${RESERVAS_ATIVAS})
      `).get(input.produto_id) as {reservada:number}
      const disponivel = produto.quantidade_atual - Number(reserva?.reservada || 0)
      if (input.quantidade > disponivel) {
        throw new Error(`Material reservado: ${produto.nome}. Disponível para retirada comum: ${disponivel} ${produto.unidade}.`)
      }
    }

    const delta = input.tipo === 'ENTRADA' ? input.quantidade : -input.quantidade
    db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual+? WHERE id=?').run(delta,input.produto_id)
    db.prepare(`
      INSERT INTO movimentacoes
        (produto_id,tipo,quantidade,responsavel,observacao,requisicao_id,origem)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      input.produto_id,
      input.tipo,
      input.quantidade,
      input.responsavel?.trim() || null,
      input.observacao?.trim() || null,
      input.requisicao_id ?? null,
      input.origem ?? (input.tipo === 'ENTRADA' ? 'ENTRADA_MANUAL' : 'REQUISICAO')
    )
  })
  tx()
}

export function exportarBanco() {
  const row = db.prepare("PRAGMA database_list").get() as { file:string }
  return row.file
}

export function importarDados(dados: {
  categorias?: any[]
  produtos?: any[]
  movimentacoes?: any[]
  requisicoes?: any[]
  requisicao_itens?: any[]
  reservas?: any[]
  reserva_itens?: any[]
}) {
  const tx = db.transaction(() => {
    if (dados.categorias) {
      const insert = db.prepare('INSERT OR IGNORE INTO categorias (id,nome,cor) VALUES (?,?,?)')
      for (const c of dados.categorias) insert.run(c.id,c.nome,c.cor ?? '#2563EB')
    }
    if (dados.produtos) {
      const insert = db.prepare(
        'INSERT OR REPLACE INTO produtos (id,nome,categoria_id,quantidade_atual,estoque_minimo,unidade,criado_em) VALUES (?,?,?,?,?,?,?)'
      )
      for (const p of dados.produtos) {
        insert.run(p.id,p.nome,p.categoria_id ?? null,p.quantidade_atual ?? 0,p.estoque_minimo ?? 5,p.unidade ?? 'UN',p.criado_em ?? new Date().toISOString())
      }
    }
    if (dados.requisicoes) {
      const insert = db.prepare(
        'INSERT OR REPLACE INTO requisicoes (id,numero,retirado_por,setor,finalidade,entregue_por,observacao,reserva_id,status,criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)'
      )
      for (const r of dados.requisicoes) {
        insert.run(r.id,r.numero,r.retirado_por,r.setor ?? null,r.finalidade ?? null,r.entregue_por ?? null,r.observacao ?? null,r.reserva_id ?? null,r.status ?? 'FINALIZADA',r.criado_em ?? new Date().toISOString())
      }
    }
    if (dados.requisicao_itens) {
      const insert = db.prepare(
        'INSERT OR REPLACE INTO requisicao_itens (id,requisicao_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?,?)'
      )
      for (const i of dados.requisicao_itens) insert.run(i.id,i.requisicao_id,i.produto_id,i.quantidade,i.unidade,i.produto_nome)
    }
    if (dados.reservas) {
      const insert = db.prepare(
        'INSERT OR REPLACE INTO reservas (id,numero,finalidade,reservado_por,observacao,status,criado_em) VALUES (?,?,?,?,?,?,?)'
      )
      for (const r of dados.reservas) insert.run(r.id,r.numero,r.finalidade,r.reservado_por ?? null,r.observacao ?? null,r.status ?? 'SEPARADO',r.criado_em ?? new Date().toISOString())
    }
    if (dados.reserva_itens) {
      const insert = db.prepare(
        'INSERT OR REPLACE INTO reserva_itens (id,reserva_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?,?)'
      )
      for (const i of dados.reserva_itens) insert.run(i.id,i.reserva_id,i.produto_id,i.quantidade,i.unidade,i.produto_nome)
    }
    if (dados.movimentacoes) {
      const insert = db.prepare(
        'INSERT OR REPLACE INTO movimentacoes (id,produto_id,tipo,quantidade,responsavel,observacao,requisicao_id,origem,criado_em) VALUES (?,?,?,?,?,?,?,?,?)'
      )
      for (const m of dados.movimentacoes) {
        insert.run(m.id,m.produto_id,m.tipo,m.quantidade,m.responsavel ?? null,m.observacao ?? null,m.requisicao_id ?? null,m.origem ?? 'MANUAL',m.criado_em ?? new Date().toISOString())
      }
    }
  })
  tx()
}

export type RequisicaoItemInput = { produto_id:number; quantidade:number }
export type RequisicaoInput = {
  retirado_por:string
  setor?:string
  finalidade?:string
  entregue_por?:string
  observacao?:string
  itens:RequisicaoItemInput[]
}

export function listarRequisicoes() {
  return db.prepare(`
    SELECT r.*, res.numero AS reserva_numero, COUNT(ri.id) AS total_itens
    FROM requisicoes r
    LEFT JOIN reservas res ON res.id=r.reserva_id
    LEFT JOIN requisicao_itens ri ON ri.requisicao_id=r.id
    GROUP BY r.id
    ORDER BY r.id DESC LIMIT 200
  `).all() as any[]
}

export function obterRequisicao(id:number) {
  const requisicao = db.prepare(`
    SELECT r.*, res.numero AS reserva_numero
    FROM requisicoes r
    LEFT JOIN reservas res ON res.id=r.reserva_id
    WHERE r.id=?
  `).get(id) as any
  if (!requisicao) throw new Error('Requisição não encontrada')
  const itens = db.prepare(
    'SELECT ri.*, p.quantidade_atual AS estoque_atual FROM requisicao_itens ri JOIN produtos p ON p.id=ri.produto_id WHERE ri.requisicao_id=? ORDER BY ri.id'
  ).all(id)
  return { ...requisicao, itens }
}

export function criarRequisicao(input:RequisicaoInput) {
  const tx = db.transaction(() => {
    const nome = input.retirado_por?.trim()
    if (!nome) throw new Error('Nome de quem retirou é obrigatório')
    if (!input.itens?.length) throw new Error('Adicione pelo menos um material')

    const numero = `REQ-${new Date().getFullYear()}-${String(
      (db.prepare('SELECT COALESCE(MAX(id),0)+1 AS proximo FROM requisicoes').get() as any).proximo
    ).padStart(6,'0')}`

    const req = db.prepare(
      'INSERT INTO requisicoes (numero,retirado_por,setor,finalidade,entregue_por,observacao) VALUES (?,?,?,?,?,?)'
    ).run(numero,nome,input.setor?.trim()||null,input.finalidade?.trim()||null,input.entregue_por?.trim()||null,input.observacao?.trim()||null)
    const requisicaoId = Number(req.lastInsertRowid)

    const produtoStmt = db.prepare(`
      SELECT p.id,p.nome,p.unidade,p.quantidade_atual,
        COALESCE((
          SELECT SUM(ri.quantidade)
          FROM reserva_itens ri JOIN reservas r ON r.id=ri.reserva_id
          WHERE ri.produto_id=p.id AND r.status IN (${RESERVAS_ATIVAS})
        ),0) AS reservada
      FROM produtos p WHERE p.id=?
    `)
    const update = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual-? WHERE id=?')
    const mov = db.prepare(
      'INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao,requisicao_id,origem) VALUES (?,?,?,?,?,?,?)'
    )
    const item = db.prepare(
      'INSERT INTO requisicao_itens (requisicao_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)'
    )

    for (const entrada of consolidarItens(input.itens)) {
      const quantidade = Number(entrada.quantidade)
      const produto = produtoStmt.get(entrada.produto_id) as any
      if (!produto) throw new Error('Produto não encontrado')
      if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error('Quantidade inválida')
      const disponivel=produto.quantidade_atual-Number(produto.reservada||0)
      if (disponivel < quantidade) {
        throw new Error(`Material reservado: ${produto.nome}. Disponível para retirada comum: ${disponivel} ${produto.unidade}.`)
      }
      update.run(quantidade, produto.id)
      item.run(requisicaoId,produto.id,quantidade,produto.unidade,produto.nome)
      mov.run(produto.id,'SAIDA',quantidade,nome,`Requisição ${numero}${input.finalidade ? ' - '+input.finalidade : ''}`,requisicaoId,'REQUISICAO')
    }
    return requisicaoId
  })
  return tx()
}

function consolidarItens(itens: RequisicaoItemInput[]) {
  const porProduto = new Map<number, number>()
  for (const item of itens) {
    const produtoId=Number(item.produto_id)
    const quantidade=Number(item.quantidade)
    porProduto.set(produtoId,(porProduto.get(produtoId) || 0) + quantidade)
  }
  return Array.from(porProduto.entries()).map(([produto_id,quantidade])=>({produto_id,quantidade}))
}

export type ReservaItemInput = { produto_id:number; quantidade:number }
export type ReservaInput = {
  finalidade:string
  reservado_por?:string
  observacao?:string
  itens:ReservaItemInput[]
}

export function listarReservas() {
  return db.prepare(`
    SELECT r.*, COUNT(ri.id) AS total_itens
    FROM reservas r LEFT JOIN reserva_itens ri ON ri.reserva_id=r.id
    GROUP BY r.id ORDER BY r.id DESC LIMIT 200
  `).all() as any[]
}

export function obterReserva(id:number) {
  const reserva = db.prepare('SELECT * FROM reservas WHERE id=?').get(id) as any
  if (!reserva) throw new Error('Reserva não encontrada')
  const itens = db.prepare('SELECT * FROM reserva_itens WHERE reserva_id=? ORDER BY id').all(id)
  return { ...reserva, itens }
}

export function criarReserva(input:ReservaInput) {
  return db.transaction(() => {
    const finalidade=input.finalidade?.trim()
    if (!finalidade) throw new Error('Informe para que o material será reservado')
    if (!input.itens?.length) throw new Error('Adicione pelo menos um material')

    const numero=`RES-${new Date().getFullYear()}-${String(
      (db.prepare('SELECT COALESCE(MAX(id),0)+1 AS proximo FROM reservas').get() as any).proximo
    ).padStart(6,'0')}`

    const reserva=db.prepare(
      'INSERT INTO reservas (numero,finalidade,reservado_por,observacao) VALUES (?,?,?,?)'
    ).run(numero,finalidade,input.reservado_por?.trim()||null,input.observacao?.trim()||null)
    const reservaId=Number(reserva.lastInsertRowid)

    const produtoStmt=db.prepare(`
      SELECT p.id,p.nome,p.unidade,p.quantidade_atual,
        COALESCE((
          SELECT SUM(ri.quantidade)
          FROM reserva_itens ri JOIN reservas r ON r.id=ri.reserva_id
          WHERE ri.produto_id=p.id AND r.status IN (${RESERVAS_ATIVAS})
        ),0) AS reservada
      FROM produtos p WHERE p.id=?
    `)
    const item=db.prepare(
      'INSERT INTO reserva_itens (reserva_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)'
    )

    for (const entrada of consolidarItens(input.itens)) {
      const quantidade=Number(entrada.quantidade)
      const produto=produtoStmt.get(entrada.produto_id) as any
      if (!produto) throw new Error('Produto não encontrado')
      if (!Number.isFinite(quantidade)||quantidade<=0) throw new Error('Quantidade inválida')
      const disponivel=produto.quantidade_atual-Number(produto.reservada||0)
      if (disponivel<quantidade) {
        throw new Error(`Não há quantidade disponível para ${produto.nome}. Disponível para reserva: ${disponivel} ${produto.unidade}`)
      }
      item.run(reservaId,produto.id,quantidade,produto.unidade,produto.nome)
    }
    return reservaId
  })()
}

export function cancelarReserva(id:number) {
  const result=db.prepare(
    "UPDATE reservas SET status='CANCELADO' WHERE id=? AND status IN ('RESERVADA','SEPARADO','AGUARDANDO_RETIRADA')"
  ).run(id)
  if (!result.changes) throw new Error('Reserva não encontrada ou já encerrada')
}

export function retirarReserva(id:number, retiradoPor:string) {
  return db.transaction(() => {
    const nome=retiradoPor?.trim()
    if(!nome) throw new Error('Informe quem está retirando o pedido')

    const reserva=db.prepare(
      "SELECT * FROM reservas WHERE id=? AND status IN ('SEPARADO','AGUARDANDO_RETIRADA','RESERVADA')"
    ).get(id) as any
    if(!reserva) throw new Error('Reserva não encontrada ou já encerrada')

    const itens=db.prepare('SELECT * FROM reserva_itens WHERE reserva_id=? ORDER BY id').all(id) as any[]
    if(!itens.length) throw new Error('A reserva não possui materiais')

    const numeroReq=`REQ-${new Date().getFullYear()}-${String(
      (db.prepare('SELECT COALESCE(MAX(id),0)+1 AS proximo FROM requisicoes').get() as any).proximo
    ).padStart(6,'0')}`
    const req=db.prepare(
      'INSERT INTO requisicoes (numero,retirado_por,finalidade,observacao,reserva_id) VALUES (?,?,?,?,?)'
    ).run(numeroReq,nome,reserva.finalidade,reserva.observacao||null,id)
    const reqId=Number(req.lastInsertRowid)

    const produto=db.prepare('SELECT quantidade_atual FROM produtos WHERE id=?')
    const update=db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual-? WHERE id=?')
    const item=db.prepare(
      'INSERT INTO requisicao_itens (requisicao_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)'
    )
    const mov=db.prepare(
      'INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao,requisicao_id,origem) VALUES (?,?,?,?,?,?,?)'
    )

    for(const i of itens){
      const p=produto.get(i.produto_id) as any
      if(!p||p.quantidade_atual<i.quantidade) throw new Error(`Estoque insuficiente para ${i.produto_nome}`)
      update.run(i.quantidade,i.produto_id)
      item.run(reqId,i.produto_id,i.quantidade,i.unidade,i.produto_nome)
      mov.run(
        i.produto_id,
        'SAIDA',
        i.quantidade,
        nome,
        `Retirada da reserva ${reserva.numero} - Requisição ${numeroReq}`,
        reqId,
        'RESERVA'
      )
    }

    db.prepare("UPDATE reservas SET status='RETIRADO' WHERE id=?").run(id)
    return reqId
  })()
}

export function atualizarStatusReserva(id:number,status:'SEPARADO'|'AGUARDANDO_RETIRADA') {
  const result=db.prepare(
    "UPDATE reservas SET status=? WHERE id=? AND status IN ('SEPARADO','AGUARDANDO_RETIRADA','RESERVADA')"
  ).run(status,id)
  if(!result.changes) throw new Error('Reserva não encontrada ou já encerrada')
}
