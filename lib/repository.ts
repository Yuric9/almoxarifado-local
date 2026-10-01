import { lerConfiguracoes } from './configuracoes'
import { MOTIVOS_BAIXA, type MotivoBaixa } from './constantes'
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
  codigo: string | null
  localizacao: string | null
  ativo: number
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
  motivo: string | null
  criado_em: string
  produto_nome: string
  unidade: string
}

export { MOTIVOS_BAIXA, type MotivoBaixa } from './constantes'

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
  cancelada_em: string | null
  motivo_cancelamento: string | null
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

type Disponibilidade = { id: number; nome: string; unidade: string; ativo: number; quantidade_atual: number; reservada: number; disponivel: number }

function disponibilidade(produtoId: number): Disponibilidade {
  const p = getDb().prepare(`
    SELECT p.id, p.nome, p.unidade, p.ativo, p.quantidade_atual,
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

export function listarCategorias(): Array<Categoria & { total_materiais: number }> {
  return getDb().prepare(`
    SELECT c.id, c.nome, c.cor, COUNT(p.id) AS total_materiais
    FROM categorias c LEFT JOIN produtos p ON p.categoria_id=c.id
    GROUP BY c.id ORDER BY c.nome COLLATE NOCASE
  `).all() as Array<Categoria & { total_materiais: number }>
}

function corValida(valor: unknown) {
  const cor = texto(valor) || '#64748B'
  if (!/^#[0-9a-fA-F]{6}$/.test(cor)) throw new Error('Cor inválida')
  return cor
}

export function criarCategoria(input: { nome: unknown; cor?: unknown }) {
  const nome = texto(input.nome)
  if (!nome) throw new Error('Informe o nome da categoria')
  const db = getDb()
  if (db.prepare('SELECT 1 FROM categorias WHERE nome=? COLLATE NOCASE').get(nome)) throw new Error(`A categoria "${nome}" já existe`)
  return Number(db.prepare('INSERT INTO categorias (nome, cor) VALUES (?, ?)').run(nome, corValida(input.cor)).lastInsertRowid)
}

export function atualizarCategoria(id: number, input: { nome?: unknown; cor?: unknown }) {
  const db = getDb()
  const atual = db.prepare('SELECT * FROM categorias WHERE id=?').get(id) as Categoria | undefined
  if (!atual) throw new Error('Categoria não encontrada')
  const nome = input.nome === undefined ? atual.nome : texto(input.nome)
  if (!nome) throw new Error('Informe o nome da categoria')
  if (db.prepare('SELECT 1 FROM categorias WHERE nome=? COLLATE NOCASE AND id<>?').get(nome, id)) throw new Error(`A categoria "${nome}" já existe`)
  const cor = input.cor === undefined ? atual.cor : corValida(input.cor)
  db.prepare('UPDATE categorias SET nome=?, cor=? WHERE id=?').run(nome, cor, id)
}

export function excluirCategoria(id: number) {
  const db = getDb()
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM produtos WHERE categoria_id=?').get(id) as { total: number }
  if (total > 0) throw new Error(`Não é possível excluir: ${total} material(is) usam esta categoria. Mude a categoria deles antes.`)
  if (!db.prepare('DELETE FROM categorias WHERE id=?').run(id).changes) throw new Error('Categoria não encontrada')
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

export type ProdutoInput = {
  nome: unknown
  categoria_id?: unknown
  quantidade?: unknown
  minimo?: unknown
  unidade?: unknown
  codigo?: unknown
  localizacao?: unknown
}

function vazio(valor: unknown) {
  return valor === undefined || valor === null || valor === ''
}

function categoriaValida(valor: unknown) {
  if (vazio(valor)) return null
  const id = Number(valor)
  if (!getDb().prepare('SELECT 1 FROM categorias WHERE id=?').get(id)) throw new Error('Categoria inválida')
  return id
}

function minimoValido(valor: unknown) {
  const minimo = vazio(valor) ? lerConfiguracoes().estoque_minimo_padrao : Number(valor)
  if (!Number.isFinite(minimo) || minimo < 0) throw new Error('Estoque mínimo inválido')
  return minimo
}

function verificarDuplicados(nome: string, codigo: string | null, ignorarId = 0) {
  const db = getDb()
  if (db.prepare('SELECT 1 FROM produtos WHERE nome=? COLLATE NOCASE AND id<>?').get(nome, ignorarId)) {
    throw new Error(`Já existe um material chamado "${nome}"`)
  }
  if (codigo && db.prepare('SELECT 1 FROM produtos WHERE codigo=? COLLATE NOCASE AND id<>?').get(codigo, ignorarId)) {
    throw new Error(`Já existe um material com o código "${codigo}"`)
  }
}

export function criarProduto(input: ProdutoInput) {
  const db = getDb()
  return db.transaction(() => {
    const nome = texto(input.nome)
    if (!nome) throw new Error('Nome é obrigatório')

    const quantidade = Number(input.quantidade ?? 0)
    if (!Number.isFinite(quantidade) || quantidade < 0) throw new Error('Quantidade inicial inválida')

    const minimo = minimoValido(input.minimo)
    const unidade = texto(input.unidade)?.toUpperCase() || 'UN'
    const categoriaId = categoriaValida(input.categoria_id)
    const codigo = texto(input.codigo)
    verificarDuplicados(nome, codigo)

    const result = db.prepare(
      'INSERT INTO produtos (nome,categoria_id,quantidade_atual,estoque_minimo,unidade,codigo,localizacao) VALUES (?,?,?,?,?,?,?)'
    ).run(nome, categoriaId, quantidade, minimo, unidade, codigo, texto(input.localizacao))
    const id = Number(result.lastInsertRowid)
    if (quantidade > 0) {
      db.prepare(
        'INSERT INTO movimentacoes (produto_id,tipo,quantidade,observacao,origem) VALUES (?,?,?,?,?)'
      ).run(id, 'ENTRADA', quantidade, 'Estoque inicial', 'ESTOQUE_INICIAL')
    }
    return id
  })()
}

/** Corrige o cadastro. A quantidade só muda por movimentação (entrada, baixa ou ajuste). */
export function atualizarProduto(id: number, input: Omit<ProdutoInput, 'quantidade'>) {
  const db = getDb()
  const atual = db.prepare('SELECT * FROM produtos WHERE id=?').get(id) as Produto | undefined
  if (!atual) throw new Error('Material não encontrado')
  const nome = input.nome === undefined ? atual.nome : texto(input.nome)
  if (!nome) throw new Error('Nome é obrigatório')
  const codigo = input.codigo === undefined ? atual.codigo : texto(input.codigo)
  verificarDuplicados(nome, codigo, id)
  db.prepare(`
    UPDATE produtos SET nome=?, categoria_id=?, estoque_minimo=?, unidade=?, codigo=?, localizacao=? WHERE id=?
  `).run(
    nome,
    input.categoria_id === undefined ? atual.categoria_id : categoriaValida(input.categoria_id),
    input.minimo === undefined ? atual.estoque_minimo : minimoValido(input.minimo),
    input.unidade === undefined ? atual.unidade : texto(input.unidade)?.toUpperCase() || 'UN',
    codigo,
    input.localizacao === undefined ? atual.localizacao : texto(input.localizacao),
    id
  )
}

/** Material inativo some das listas de seleção, mas mantém o histórico. */
export function definirProdutoAtivo(id: number, ativo: boolean) {
  const db = getDb()
  if (!ativo) {
    const p = disponibilidade(id)
    if (p.reservada > 0) throw new Error('Este material está em uma reserva aberta. Retire ou cancele a reserva antes de inativar.')
  }
  if (!db.prepare('UPDATE produtos SET ativo=? WHERE id=?').run(ativo ? 1 : 0, id).changes) throw new Error('Material não encontrado')
}

/** Só permite excluir material sem histórico além do estoque inicial. */
export function excluirProduto(id: number) {
  const db = getDb()
  db.transaction(() => {
    const usos = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM movimentacoes WHERE produto_id=? AND origem<>'ESTOQUE_INICIAL') +
        (SELECT COUNT(*) FROM requisicao_itens WHERE produto_id=?) +
        (SELECT COUNT(*) FROM reserva_itens WHERE produto_id=?) AS total
    `).get(id, id, id) as { total: number }
    if (usos.total > 0) throw new Error('Este material já tem movimentações. Para preservar o histórico, use "Inativar".')
    db.prepare('DELETE FROM movimentacoes WHERE produto_id=?').run(id)
    if (!db.prepare('DELETE FROM produtos WHERE id=?').run(id).changes) throw new Error('Material não encontrado')
  })()
}

/** Ficha do material: dados, reservas abertas e histórico. */
export function obterProduto(id: number) {
  const db = getDb()
  const produto = listarProdutos().find(p => p.id === id)
  if (!produto) throw new Error('Material não encontrado')
  const movimentacoes = listarMovimentacoes({ produto_id: id, limite: 200 })
  const reservas = db.prepare(`
    SELECT r.id, r.numero, r.finalidade, r.status, ri.quantidade
    FROM reserva_itens ri JOIN reservas r ON r.id=ri.reserva_id
    WHERE ri.produto_id=? AND r.status IN ${RESERVAS_ATIVAS}
    ORDER BY r.id DESC
  `).all(id) as Array<{ id: number; numero: string; finalidade: string; status: StatusReserva; quantidade: number }>
  return { ...produto, movimentacoes, reservas }
}

/* ------------------------------------------------------------------ movimentações */

export type FiltroMovimentacoes = {
  produto_id?: number
  tipo?: 'ENTRADA' | 'SAIDA'
  /** Limites em UTC no formato do SQLite ("AAAA-MM-DD HH:MM:SS"). */
  de?: string
  ate?: string
  limite?: number
}

export function listarMovimentacoes(filtro: FiltroMovimentacoes = {}): Movimentacao[] {
  const condicoes: string[] = []
  const valores: Array<string | number> = []
  if (filtro.produto_id) { condicoes.push('m.produto_id=?'); valores.push(filtro.produto_id) }
  if (filtro.tipo) { condicoes.push('m.tipo=?'); valores.push(filtro.tipo) }
  if (filtro.de) { condicoes.push('m.criado_em>=?'); valores.push(filtro.de) }
  if (filtro.ate) { condicoes.push('m.criado_em<?'); valores.push(filtro.ate) }
  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
  return getDb().prepare(`
    SELECT m.*, p.nome AS produto_nome, p.unidade AS unidade
    FROM movimentacoes m JOIN produtos p ON p.id=m.produto_id
    ${onde}
    ORDER BY m.criado_em DESC, m.id DESC LIMIT ?
  `).all(...valores, Math.min(filtro.limite ?? 100, 5000)) as Movimentacao[]
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

/** Baixa por perda, roubo, vencimento ou quebra. Não consome material reservado. */
export function registrarBaixa(input: { produto_id: unknown; quantidade: unknown; motivo: unknown; responsavel?: unknown; observacao?: unknown }) {
  const db = getDb()
  db.transaction(() => {
    const motivo = String(input.motivo || '') as MotivoBaixa
    if (!(motivo in MOTIVOS_BAIXA)) throw new Error('Selecione o motivo da baixa')
    const quantidade = quantidadeValida(input.quantidade)
    const produto = disponibilidade(Number(input.produto_id))
    if (quantidade > produto.disponivel) {
      throw new Error(`Só ${produto.disponivel} ${produto.unidade} de ${produto.nome} estão livres (o restante está reservado).`)
    }
    const observacao = texto(input.observacao)
    if (motivo === 'OUTRO' && !observacao) throw new Error('Descreva o motivo na observação')
    db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual-? WHERE id=?').run(quantidade, produto.id)
    db.prepare(`
      INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao,origem,motivo)
      VALUES (?,?,?,?,?,?,?)
    `).run(produto.id, 'SAIDA', quantidade, texto(input.responsavel), observacao, 'BAIXA', motivo)
  })()
}

/** Ajuste de inventário: informa a quantidade contada e o sistema lança a diferença. */
export function ajustarEstoque(input: { produto_id: unknown; quantidade_contada: unknown; responsavel?: unknown; observacao?: unknown }) {
  const db = getDb()
  return db.transaction(() => {
    const contada = Number(input.quantidade_contada)
    if (vazio(input.quantidade_contada) || !Number.isFinite(contada) || contada < 0) throw new Error('Informe a quantidade contada')
    const produto = disponibilidade(Number(input.produto_id))
    if (contada < produto.reservada) {
      throw new Error(`Há ${produto.reservada} ${produto.unidade} reservados. A contagem não pode ficar abaixo disso; ajuste as reservas antes.`)
    }
    const diferenca = Math.round((contada - produto.quantidade_atual) * 1000) / 1000
    if (diferenca === 0) throw new Error('A quantidade contada é igual ao estoque atual')
    db.prepare('UPDATE produtos SET quantidade_atual=? WHERE id=?').run(contada, produto.id)
    db.prepare(`
      INSERT INTO movimentacoes (produto_id,tipo,quantidade,responsavel,observacao,origem,motivo)
      VALUES (?,?,?,?,?,?,?)
    `).run(produto.id, diferenca > 0 ? 'ENTRADA' : 'SAIDA', Math.abs(diferenca), texto(input.responsavel), texto(input.observacao), 'AJUSTE', 'INVENTARIO')
    return diferenca
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
      if (!produto.ativo) throw new Error(`O material ${produto.nome} está inativo`)
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

/** Desfaz uma retirada lançada por engano: devolve o material ao estoque. */
export function estornarRequisicao(id: number, motivo: unknown) {
  const db = getDb()
  db.transaction(() => {
    const justificativa = texto(motivo)
    if (!justificativa) throw new Error('Informe o motivo do estorno')
    const req = db.prepare("SELECT * FROM requisicoes WHERE id=? AND status='FINALIZADA'").get(id) as Requisicao | undefined
    if (!req) throw new Error('Retirada não encontrada ou já estornada')
    const itens = db.prepare('SELECT * FROM requisicao_itens WHERE requisicao_id=?').all(id) as ItemDocumento[]
    const devolve = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual+? WHERE id=?')
    const mov = db.prepare('INSERT INTO movimentacoes (produto_id,tipo,quantidade,observacao,requisicao_id,origem,motivo) VALUES (?,?,?,?,?,?,?)')
    for (const i of itens) {
      devolve.run(i.quantidade, i.produto_id)
      mov.run(i.produto_id, 'ENTRADA', i.quantidade, `Estorno da ${req.numero}: ${justificativa}`, id, 'ESTORNO', null)
    }
    db.prepare("UPDATE requisicoes SET status='CANCELADA', cancelada_em=CURRENT_TIMESTAMP, motivo_cancelamento=? WHERE id=?").run(justificativa, id)
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
  const reserva = db.prepare(`
    SELECT r.*, (SELECT q.id FROM requisicoes q WHERE q.reserva_id=r.id ORDER BY q.id DESC LIMIT 1) AS requisicao_id
    FROM reservas r WHERE r.id=?
  `).get(id) as (Reserva & { requisicao_id: number | null }) | undefined
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
      if (!produto.ativo) throw new Error(`O material ${produto.nome} está inativo`)
      if (produto.disponivel < entrada.quantidade) {
        throw new Error(`Não há quantidade disponível para ${produto.nome}. Disponível para reserva: ${produto.disponivel} ${produto.unidade}.`)
      }
      item.run(reservaId, produto.id, entrada.quantidade, produto.unidade, produto.nome)
    }
    return reservaId
  })()
}

/** Edita uma reserva aberta: dados e materiais. */
export function atualizarReserva(id: number, input: ReservaInput) {
  const db = getDb()
  db.transaction(() => {
    const reserva = db.prepare(`SELECT * FROM reservas WHERE id=? AND status IN ${RESERVAS_ATIVAS}`).get(id) as Reserva | undefined
    if (!reserva) throw new Error('Só é possível editar reservas abertas')
    const finalidade = texto(input.finalidade)
    if (!finalidade) throw new Error('Informe para que o material será reservado')
    if (!Array.isArray(input.itens) || !input.itens.length) throw new Error('Adicione pelo menos um material')
    const itens = consolidarItens(input.itens)

    db.prepare('UPDATE reservas SET finalidade=?, reservado_por=?, observacao=? WHERE id=?')
      .run(finalidade, texto(input.reservado_por), texto(input.observacao), id)
    // Remove os itens antigos para que o disponível considere só a nova reserva.
    db.prepare('DELETE FROM reserva_itens WHERE reserva_id=?').run(id)
    const item = db.prepare('INSERT INTO reserva_itens (reserva_id,produto_id,quantidade,unidade,produto_nome) VALUES (?,?,?,?,?)')
    for (const entrada of itens) {
      const produto = disponibilidade(entrada.produto_id)
      if (produto.disponivel < entrada.quantidade) {
        throw new Error(`Não há quantidade disponível para ${produto.nome}. Disponível para reserva: ${produto.disponivel} ${produto.unidade}.`)
      }
      item.run(id, produto.id, entrada.quantidade, produto.unidade, produto.nome)
    }
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
