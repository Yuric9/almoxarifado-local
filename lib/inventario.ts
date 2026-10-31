import { getDb } from './db'
import { autor, proximoNumero, texto, vazio } from './repository'

/**
 * Inventário completo (contagem geral do estoque).
 * 1. Ao iniciar, guarda quanto o sistema tinha de cada material ("foto" do estoque).
 * 2. A contagem é lançada aos poucos (dá para salvar e continuar).
 * 3. Ao finalizar, cada diferença (contado − sistema no início) vira um ajuste de inventário.
 *    Usar a diferença, e não "trocar pelo contado", preserva retiradas e entradas feitas
 *    enquanto o inventário estava aberto.
 * Materiais não contados ficam como estão.
 */

export type StatusInventario = 'ABERTO' | 'FINALIZADO' | 'CANCELADO'

export type Inventario = {
  id: number
  numero: string
  descricao: string | null
  escopo: string
  responsavel: string | null
  observacao: string | null
  status: StatusInventario
  usuario_nome: string | null
  criado_em: string
  finalizado_em: string | null
  finalizado_por: string | null
  ultima_mov_id: number
  total_itens: number
  contados: number
  divergentes: number
}

export type ItemInventario = {
  id: number
  produto_id: number
  produto_nome: string
  unidade: string
  categoria: string | null
  localizacao: string | null
  quantidade_sistema: number
  quantidade_contada: number | null
  ajuste: number | null
  /** 1 se o material teve entrada/saída depois do início do inventário. */
  movimentado: number
}

export type InventarioDetalhe = Inventario & { itens: ItemInventario[] }

const arred = (n: number) => Math.round(n * 1000) / 1000

const SELECT_INVENTARIO = `
  SELECT v.*, COUNT(i.id) AS total_itens,
    COUNT(i.quantidade_contada) AS contados,
    SUM(CASE WHEN i.quantidade_contada IS NOT NULL AND ABS(i.quantidade_contada - i.quantidade_sistema) > 0.0005 THEN 1 ELSE 0 END) AS divergentes
  FROM inventarios v LEFT JOIN inventario_itens i ON i.inventario_id=v.id
`

export function listarInventarios(): Inventario[] {
  return getDb().prepare(`${SELECT_INVENTARIO} GROUP BY v.id ORDER BY v.id DESC`).all() as Inventario[]
}

export function obterInventario(id: number): InventarioDetalhe {
  const db = getDb()
  const v = db.prepare(`${SELECT_INVENTARIO} WHERE v.id=? GROUP BY v.id`).get(id) as Inventario | undefined
  if (!v) throw new Error('Inventário não encontrado')
  const itens = db.prepare(`
    SELECT i.*,
      CASE WHEN ? = 'ABERTO' AND EXISTS (
        SELECT 1 FROM movimentacoes m WHERE m.produto_id=i.produto_id AND m.id > ?
      ) THEN 1 ELSE 0 END AS movimentado
    FROM inventario_itens i WHERE i.inventario_id=?
    ORDER BY i.localizacao IS NULL, i.localizacao COLLATE NOCASE, i.produto_nome COLLATE NOCASE
  `).all(v.status, v.ultima_mov_id, id) as ItemInventario[]
  return { ...v, itens }
}

export function iniciarInventario(input: { descricao?: unknown; categoria_id?: unknown; localizacao?: unknown; responsavel?: unknown }) {
  const db = getDb()
  return db.transaction(() => {
    const aberto = db.prepare("SELECT numero FROM inventarios WHERE status='ABERTO'").get() as { numero: string } | undefined
    if (aberto) throw new Error(`Já existe um inventário em andamento (${aberto.numero}). Finalize ou cancele antes de iniciar outro.`)

    const filtros: string[] = ['p.ativo=1']
    const params: unknown[] = []
    const partes: string[] = []
    if (!vazio(input.categoria_id)) {
      const cat = db.prepare('SELECT id, nome FROM categorias WHERE id=?').get(Number(input.categoria_id)) as { id: number; nome: string } | undefined
      if (!cat) throw new Error('Categoria inválida')
      filtros.push('p.categoria_id=?'); params.push(cat.id); partes.push(`Categoria: ${cat.nome}`)
    }
    const local = texto(input.localizacao)
    if (local) { filtros.push('p.localizacao LIKE ? COLLATE NOCASE'); params.push(`%${local}%`); partes.push(`Localização: ${local}`) }

    const produtos = db.prepare(`
      SELECT p.id, p.nome, p.unidade, p.localizacao, p.quantidade_atual, c.nome AS categoria
      FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id
      WHERE ${filtros.join(' AND ')}
    `).all(...params) as Array<{ id: number; nome: string; unidade: string; localizacao: string | null; quantidade_atual: number; categoria: string | null }>
    if (!produtos.length) throw new Error('Nenhum material ativo encontrado com esse filtro')

    const numero = proximoNumero('INV', 'inventarios')
    const ultimaMov = (db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM movimentacoes').get() as { id: number }).id
    const id = Number(db.prepare('INSERT INTO inventarios (numero, descricao, escopo, responsavel, usuario_nome, ultima_mov_id) VALUES (?,?,?,?,?,?)')
      .run(numero, texto(input.descricao), partes.join(' · ') || 'Todos os materiais', texto(input.responsavel), autor()[1], ultimaMov).lastInsertRowid)
    const item = db.prepare(`
      INSERT INTO inventario_itens (inventario_id, produto_id, produto_nome, unidade, categoria, localizacao, quantidade_sistema)
      VALUES (?,?,?,?,?,?,?)
    `)
    for (const p of produtos) item.run(id, p.id, p.nome, p.unidade, p.categoria, p.localizacao, p.quantidade_atual)
    return id
  })()
}

function exigirAberto(id: number) {
  const v = getDb().prepare('SELECT status, numero FROM inventarios WHERE id=?').get(id) as { status: StatusInventario; numero: string } | undefined
  if (!v) throw new Error('Inventário não encontrado')
  if (v.status !== 'ABERTO') throw new Error(`O inventário ${v.numero} já foi ${v.status === 'FINALIZADO' ? 'finalizado' : 'cancelado'}`)
  return v
}

/** Salva a contagem (parcial ou total). Quantidade vazia = ainda não contado. */
export function salvarContagem(id: number, input: { contagens?: unknown; responsavel?: unknown; observacao?: unknown }) {
  const db = getDb()
  db.transaction(() => {
    exigirAberto(id)
    const atualizar = db.prepare('UPDATE inventario_itens SET quantidade_contada=? WHERE id=? AND inventario_id=?')
    for (const c of Array.isArray(input.contagens) ? input.contagens as Array<{ item_id: unknown; quantidade_contada: unknown }> : []) {
      let qtd: number | null = null
      if (!vazio(c.quantidade_contada)) {
        qtd = Number(c.quantidade_contada)
        if (!Number.isFinite(qtd) || qtd < 0) throw new Error('Quantidade contada inválida')
      }
      if (!atualizar.run(qtd, Number(c.item_id), id).changes) throw new Error('Item do inventário não encontrado')
    }
    if (input.responsavel !== undefined) db.prepare('UPDATE inventarios SET responsavel=? WHERE id=?').run(texto(input.responsavel), id)
    if (input.observacao !== undefined) db.prepare('UPDATE inventarios SET observacao=? WHERE id=?').run(texto(input.observacao), id)
  })()
}

/** Aplica as diferenças como ajuste de inventário e fecha. */
export function finalizarInventario(id: number) {
  const db = getDb()
  return db.transaction(() => {
    const { numero } = exigirAberto(id)
    const inv = obterInventario(id)
    const contados = inv.itens.filter(i => i.quantidade_contada !== null)
    if (!contados.length) throw new Error('Nenhum material foi contado ainda')

    const [usuarioId, usuarioNome] = autor()
    const estoque = db.prepare(`
      SELECT p.quantidade_atual,
        COALESCE((SELECT SUM(ri.quantidade) FROM reserva_itens ri JOIN reservas r ON r.id=ri.reserva_id
          WHERE ri.produto_id=p.id AND r.status IN ('SEPARADO','AGUARDANDO_RETIRADA')),0) AS reservada
      FROM produtos p WHERE p.id=?
    `)
    const problemas: string[] = []
    const ajustes: Array<{ item: ItemInventario; diferenca: number }> = []
    for (const item of contados) {
      const diferenca = arred(item.quantidade_contada! - item.quantidade_sistema)
      if (diferenca === 0) continue
      const atual = estoque.get(item.produto_id) as { quantidade_atual: number; reservada: number }
      const novo = arred(atual.quantidade_atual + diferenca)
      if (novo < 0) problemas.push(`${item.produto_nome}: o estoque ficaria negativo (${novo} ${item.unidade})`)
      else if (novo < atual.reservada) problemas.push(`${item.produto_nome}: ficaria abaixo do reservado (${atual.reservada} ${item.unidade})`)
      ajustes.push({ item, diferenca })
    }
    if (problemas.length) throw new Error(`Confira antes de finalizar: ${problemas.join('; ')}`)

    const mudarEstoque = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual+? WHERE id=?')
    const mov = db.prepare(`
      INSERT INTO movimentacoes (produto_id, tipo, quantidade, responsavel, observacao, origem, motivo, inventario_id, usuario_id, usuario_nome)
      VALUES (?,?,?,?,?,'AJUSTE','INVENTARIO',?,?,?)
    `)
    const gravarAjuste = db.prepare('UPDATE inventario_itens SET ajuste=? WHERE id=?')
    for (const { item, diferenca } of ajustes) {
      mudarEstoque.run(diferenca, item.produto_id)
      mov.run(item.produto_id, diferenca > 0 ? 'ENTRADA' : 'SAIDA', Math.abs(diferenca), inv.responsavel, `Inventário ${numero}`, id, usuarioId, usuarioNome)
      gravarAjuste.run(diferenca, item.id)
    }
    db.prepare("UPDATE inventarios SET status='FINALIZADO', finalizado_em=CURRENT_TIMESTAMP, finalizado_por=? WHERE id=?").run(usuarioNome, id)
    return { ajustados: ajustes.length, nao_contados: inv.itens.length - contados.length }
  })()
}

export function cancelarInventario(id: number) {
  exigirAberto(id)
  getDb().prepare("UPDATE inventarios SET status='CANCELADO', finalizado_em=CURRENT_TIMESTAMP, finalizado_por=? WHERE id=?").run(autor()[1], id)
}
