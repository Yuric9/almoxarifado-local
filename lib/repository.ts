import { getDb } from './db'

const RESERVAS_ATIVAS = "('SEPARADO','AGUARDANDO_RETIRADA')"

export type Categoria = { id: number; nome: string; cor: string }

export type Produto = {
  id: number
  nome: string
  categoria_id: number | null
  quantidade_atual: number
  estoque_minimo: number
  unidade: string
  criado_em: string
  categoria: string | null
  quantidade_reservada: number
  quantidade_disponivel: number
}

export type Movimentacao = {
  id: number
  produto_id: number
  tipo: 'ENTRADA' | 'SAIDA'
  quantidade: number
  responsavel: string | null
  observacao: string | null
  requisicao_id: number | null
  origem: string
  criado_em: string
  produto_nome: string
  unidade: string
}

export type ItemInput = { produto_id: number; quantidade: number }

export type Requisicao = {
  id: number
  numero: string
  retirado_por: string
  setor: string | null
  finalidade: string | null
  entregue_por: string | null
  observacao: string | null
  reserva_id: number | null
  reserva_numero: string | null
  status: 'FINALIZADA' | 'CANCELADA'
  criado_em: string
}

export type ItemDocumento = {
  id: number
  produto_id: number
  quantidade: number
  unidade: string
  produto_nome: string
}

export type StatusReserva = 'SEPARADO' | 'AGUARDANDO_RETIRADA' | 'RETIRADO' | 'CANCELADO'

export type Reserva = {
  id: number
  numero: string
  finalidade: string
  reservado_por: string | null
  observacao: string | null
  status: StatusReserva
  criado_em: string
}

/* ------------------------------------------------------------------ utilidades */

function texto(valor: unknown) {
  const t = typeof valor === 'string' ? valor.trim() : ''
  return t || null
}

function quantidadeValida(valor: unknown, rotulo = 'Quantidade') {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${rotulo} deve ser maior que zero`)
  return n
}

function proximoNumero(prefixo: 'REQ' | 'RES', tabela: 'requisicoes' | 'reservas') {
  const { proximo } = getDb().prepare(`SELECT COALESCE(MAX(id),0)+1 AS proximo FROM ${tabela}`).get() as { proximo: number }
  return `${prefixo}-${new Date().getFullYear()}-${String(proximo).padStart(6, '0')}`
}

/** Soma quantidades do mesmo material para validar o disponível corretamente. */
export function consolidarItens(itens: ItemInput[]) {
  const porProduto = new Map<number, number>()
  for (const item of itens) {
    const produtoId = Number(item.produto_id)
    if (!Number.isInteger(produtoId) || produtoId <= 0) throw new Error('Material inválido')
    porProduto.set(produtoId, (porProduto.get(produtoId) || 0) + quantidadeValida(item.quantidade))
  }
  return Array.from(porProduto, ([produto_id, quantidade]) => ({ produto_id, quantidade }))
}

type Disponibilidade = { id: number; nome: string; unidade: string; quantidade_atual: number; reservada: number; disponivel: number }

function disponibilidade(produtoId: number): Disponibilidade {
  const p = getDb().prepare(`
    SELECT p.id, p.nome, p.unidade, p.quantidade_atual,
      COALESCE((
        SELECT SUM(ri.quantidade) FROM reserva_itens ri JOIN reservas r ON r.id=ri.reserva_id
        WHERE ri.produto_id=p.id AND r.status IN ${RESERVAS_ATIVAS}
      ),0) AS reservada
    FROM produtos p WHERE p.id=?
  `).get(produtoId) as Omit<Disponibilidade, 'disponivel'> | undefined
  if (!p) throw new Error('Material não encontrado')
  return { ...p, disponivel: p.quantidade_atual - p.reservada }
}

/* ------------------------------------------------------------------ categorias */

export function listarCategorias(): Categoria[] {
  return getDb().prepare('SELECT id, nome, cor FROM categorias ORDER BY nome').all() as Categoria[]
}

/* ------------------------------------------------------------------ produtos */

export function listarProdutos(): Produto[] {
  return getDb().prepare(`
    SELECT p.*, c.nome AS categoria,
      COALESCE(res.reservada,0) AS quantidade_reservada,
      p.quantidade_atual - COALESCE(res.reservada,0) AS quantidade_disponivel
    FROM produtos p
    LEFT JOIN categorias c ON c.id=p.categoria_id
    LEFT JOIN (
      SELECT ri.produto_id, SUM(ri.quantidade) AS reservada
      FROM reserva_itens ri JOIN reservas r ON r.id=ri.reserva_id
      WHERE r.status IN ${RESERVAS_ATIVAS}
      GROUP BY ri.produto_id
    ) res ON res.produto_id=p.id
    ORDER BY p.nome COLLATE NOCASE
  `).all() as Produto[]
}

export function criarProduto(input: { nome: unknown; categoria_id?: unknown; quantidade?: unknown; minimo?: unknown; unidade?: unknown }) {
  const db = getDb()
  return db.transaction(() => {
    const nome = texto(input.nome)
    if (!nome) throw new Error('Nome é obrigatório')

    const quantidade = Number(input.quantidade ?? 0)
    if (!Number.isFinite(quantidade) || quantidade < 0) throw new Error('Quantidade inicial inválida')

    const minimo = input.minimo === undefined || input.minimo === null || input.minimo === '' ? 5 : Number(input.minimo)
    if (!Number.isFinite(minimo) || minimo < 0) throw new Error('Estoque mínimo inválido')

    const unidade = texto(input.unidade)?.toUpperCase() || 'UN'

    let categoriaId: number | null = null
    if (input.categoria_id !== undefined && input.categoria_id !== null && input.categoria_id !== '') {
      categoriaId = Number(input.categoria_id)
      if (!db.prepare('SELECT 1 FROM categorias WHERE id=?').get(categoriaId)) throw new Error('Categoria inválida')
    }

    const duplicado = db.prepare('SELECT 1 FROM produtos WHERE nome=? COLLATE NOCASE').get(nome)
    if (duplicado) throw new Error(`Já existe um material chamado "${nome}"`)

    const result = db.prepare(
      'INSERT INTO produtos (nome,categoria_id,quantidade_atual,estoque_minimo,unidade) VALUES (?,?,?,?,?)'
    ).run(nome, categoriaId, quantidade, minimo, unidade)
    const id = Number(result.lastInsertRowid)
    if (quantidade > 0) {
      db.prepare(
        'INSERT INTO movimentacoes (produto_id,tipo,quantidade,observacao,origem) VALUES (?,?,?,?,?)'
      ).run(id, 'ENTRADA', quantidade, 'Estoque inicial', 'ESTOQUE_INICIAL')
    }
    return id
  })()
}

/* ------------------------------------------------------------------ movimentações */

export function listarMovimentacoes(limite = 100): Movimentacao[] {
  return getDb().prepare(`
    SELECT m.*, p.nome AS produto_nome, p.unidade AS unidade
    FROM movimentacoes m JOIN produtos p ON p.id=m.produto_id
    ORDER BY m.criado_em DESC, m.id DESC LIMIT ?
  `).all(limite) as Movimentacao[]
}

/**
 * Entrada rápida de material. Saídas só acontecem por requisição
 * (criarRequisicao / retirarReserva), para manter a auditoria.
 */
export function registrarEntrada(input: { produto_id: unknown; quantidade: unknown; responsavel?: unknown; observacao?: unknown }) {
  const db = getDb()
  db.transaction(() => {
    const produtoId = Number(input.produto_id)
    const quantidade = quantidadeValida(input.quantidade)
    const produto = db.prepare('SELECT id FROM produtos WHERE id=?').get(produtoId)
    if (!produto) throw new Error('Material não encontrado')
    db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual+? WHERE id=?').run(quantidade, produtoId)
    db.prepare(`
      INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao,origem)
      VALUES (?,?,?,?,?,?)
    `).run(produtoId, 'ENTRADA', quantidade, texto(input.responsavel), texto(input.observacao), 'ENTRADA_MANUAL')
  })()
}

/* ------------------------------------------------------------------ requisições */

export type RequisicaoInput = {
  retirado_por: unknown
  setor?: unknown
  finalidade?: unknown
  entregue_por?: unknown
  observacao?: unknown
  itens: ItemInput[]
}

export function listarRequisicoes() {
  return getDb().prepare(`
    SELECT r.*, res.numero AS reserva_numero, COUNT(ri.id) AS total_itens
    FROM requisicoes r
    LEFT JOIN reservas res ON res.id=r.reserva_id
    LEFT JOIN requisicao_itens ri ON ri.requisicao_id=r.id
    GROUP BY r.id
    ORDER BY r.id DESC LIMIT 200
  `).all() as Array<Requisicao & { total_itens: number }>
}

export function obterRequisicao(id: number) {
  const db = getDb()
  const requisicao = db.prepare(`
    SELECT r.*, res.numero AS reserva_numero
    FROM requisicoes r LEFT JOIN reservas res ON res.id=r.reserva_id
    WHERE r.id=?
  `).get(id) as Requisicao | undefined
  if (!requisicao) throw new Error('Requisição não encontrada')
  const itens = db.prepare('SELECT * FROM requisicao_itens WHERE requisicao_id=? ORDER BY id').all(id) as ItemDocumento[]
  return { ...requisicao, itens }
}

export function criarRequisicao(input: RequisicaoInput) {
  const db = getDb()
  return db.transaction(() => {
    const nome = texto(input.retirado_por)
    if (!nome) throw new Error('Nome de quem retirou é obrigatório')
    if (!Array.isArray(input.itens) || !input.itens.length) throw new Error('Adicione pelo menos um material')
    const itens = consolidarItens(input.itens)
    const finalidade = texto(input.finalidade)

    const numero = proximoNumero('REQ', 'requisicoes')
    const req = db.prepare(
      'INSERT INTO requisicoes (numero,retirado_por,setor,finalidade,entregue_por,observacao) VALUES (?,?,?,?,?,?)'
    ).run(numero, nome, texto(input.setor), finalidade, texto(input.entregue_por), texto(input.observacao))
    const requisicaoId = Number(req.lastInsertRowid)

    const baixa = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual-? WHERE id=?')
    const item = db.prepare('INSERT INTO requisicao_itens (requisicao_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)')
    const mov = db.prepare('INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao,requisicao_id,origem) VALUES (?,?,?,?,?,?,?)')

    for (const entrada of itens) {
      const produto = disponibilidade(entrada.produto_id)
      if (produto.disponivel < entrada.quantidade) {
        throw new Error(`Quantidade indisponível: ${produto.nome}. Disponível para retirada: ${produto.disponivel} ${produto.unidade}.`)
      }
      baixa.run(entrada.quantidade, produto.id)
      item.run(requisicaoId, produto.id, entrada.quantidade, produto.unidade, produto.nome)
      mov.run(produto.id, 'SAIDA', entrada.quantidade, nome, `Requisição ${numero}${finalidade ? ' - ' + finalidade : ''}`, requisicaoId, 'REQUISICAO')
    }
    return requisicaoId
  })()
}

/* ------------------------------------------------------------------ reservas */

export type ReservaInput = {
  finalidade: unknown
  reservado_por?: unknown
  observacao?: unknown
  itens: ItemInput[]
}

export function listarReservas() {
  return getDb().prepare(`
    SELECT r.*, COUNT(ri.id) AS total_itens
    FROM reservas r LEFT JOIN reserva_itens ri ON ri.reserva_id=r.id
    GROUP BY r.id ORDER BY r.id DESC LIMIT 200
  `).all() as Array<Reserva & { total_itens: number }>
}

export function obterReserva(id: number) {
  const db = getDb()
  const reserva = db.prepare('SELECT * FROM reservas WHERE id=?').get(id) as Reserva | undefined
  if (!reserva) throw new Error('Reserva não encontrada')
  const itens = db.prepare('SELECT * FROM reserva_itens WHERE reserva_id=? ORDER BY id').all(id) as ItemDocumento[]
  return { ...reserva, itens }
}

export function criarReserva(input: ReservaInput) {
  const db = getDb()
  return db.transaction(() => {
    const finalidade = texto(input.finalidade)
    if (!finalidade) throw new Error('Informe para que o material será reservado')
    if (!Array.isArray(input.itens) || !input.itens.length) throw new Error('Adicione pelo menos um material')
    const itens = consolidarItens(input.itens)

    const numero = proximoNumero('RES', 'reservas')
    const reserva = db.prepare(
      'INSERT INTO reservas (numero,finalidade,reservado_por,observacao) VALUES (?,?,?,?)'
    ).run(numero, finalidade, texto(input.reservado_por), texto(input.observacao))
    const reservaId = Number(reserva.lastInsertRowid)

    const item = db.prepare('INSERT INTO reserva_itens (reserva_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)')
    for (const entrada of itens) {
      const produto = disponibilidade(entrada.produto_id)
      if (produto.disponivel < entrada.quantidade) {
        throw new Error(`Não há quantidade disponível para ${produto.nome}. Disponível para reserva: ${produto.disponivel} ${produto.unidade}.`)
      }
      item.run(reservaId, produto.id, entrada.quantidade, produto.unidade, produto.nome)
    }
    return reservaId
  })()
}

export function cancelarReserva(id: number) {
  const result = getDb().prepare(
    `UPDATE reservas SET status='CANCELADO' WHERE id=? AND status IN ${RESERVAS_ATIVAS}`
  ).run(id)
  if (!result.changes) throw new Error('Reserva não encontrada ou já encerrada')
}

export function atualizarStatusReserva(id: number, status: unknown) {
  if (status !== 'SEPARADO' && status !== 'AGUARDANDO_RETIRADA') throw new Error('Status inválido')
  const result = getDb().prepare(
    `UPDATE reservas SET status=? WHERE id=? AND status IN ${RESERVAS_ATIVAS}`
  ).run(status, id)
  if (!result.changes) throw new Error('Reserva não encontrada ou já encerrada')
}

export function retirarReserva(id: number, retiradoPor: unknown) {
  const db = getDb()
  return db.transaction(() => {
    const nome = texto(retiradoPor)
    if (!nome) throw new Error('Informe quem está retirando o pedido')

    const reserva = db.prepare(`SELECT * FROM reservas WHERE id=? AND status IN ${RESERVAS_ATIVAS}`).get(id) as Reserva | undefined
    if (!reserva) throw new Error('Reserva não encontrada ou já encerrada')

    const itens = db.prepare('SELECT * FROM reserva_itens WHERE reserva_id=? ORDER BY id').all(id) as ItemDocumento[]
    if (!itens.length) throw new Error('A reserva não possui materiais')

    const numeroReq = proximoNumero('REQ', 'requisicoes')
    const req = db.prepare(
      'INSERT INTO requisicoes (numero,retirado_por,finalidade,observacao,reserva_id) VALUES (?,?,?,?,?)'
    ).run(numeroReq, nome, reserva.finalidade, reserva.observacao, id)
    const reqId = Number(req.lastInsertRowid)

    const estoque = db.prepare('SELECT quantidade_atual FROM produtos WHERE id=?')
    const baixa = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual-? WHERE id=?')
    const item = db.prepare('INSERT INTO requisicao_itens (requisicao_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)')
    const mov = db.prepare('INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao,requisicao_id,origem) VALUES (?,?,?,?,?,?,?)')

    for (const i of itens) {
      const p = estoque.get(i.produto_id) as { quantidade_atual: number } | undefined
      if (!p || p.quantidade_atual < i.quantidade) throw new Error(`Estoque insuficiente para ${i.produto_nome}`)
      baixa.run(i.quantidade, i.produto_id)
      item.run(reqId, i.produto_id, i.quantidade, i.unidade, i.produto_nome)
      mov.run(i.produto_id, 'SAIDA', i.quantidade, nome, `Retirada da reserva ${reserva.numero} - Requisição ${numeroReq}`, reqId, 'RESERVA')
    }

    db.prepare("UPDATE reservas SET status='RETIRADO' WHERE id=?").run(id)
    return reqId
  })()
}
