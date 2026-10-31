import { getDb } from './db'
import { resolverDestino } from './pessoas'
import { autor, consolidarItens, disponibilidade, proximoNumero, texto, type ItemInput } from './repository'

/**
 * Empréstimo de ferramentas e equipamentos: o material sai do estoque com quem pegou
 * e volta na devolução. A devolução pode ser em partes; o que não voltar (perdido, quebrado)
 * é registrado como "não devolvido" para fechar o empréstimo, sem voltar ao estoque.
 */

export type StatusEmprestimo = 'ABERTO' | 'DEVOLVIDO'

export type Emprestimo = {
  id: number
  numero: string
  retirado_por: string
  funcionario_id: number | null
  setor: string | null
  setor_id: number | null
  previsao_devolucao: string | null
  observacao: string | null
  status: StatusEmprestimo
  usuario_nome: string | null
  criado_em: string
  devolvido_em: string | null
  total_itens: number
  /** Quantidade ainda com a pessoa (soma de todos os itens). */
  pendente: number
  atrasado: number
}

export type ItemEmprestimo = {
  id: number
  produto_id: number
  produto_nome: string
  unidade: string
  quantidade: number
  devolvida: number
  nao_devolvida: number
}

export type EmprestimoDetalhe = Emprestimo & { itens: ItemEmprestimo[] }

const arred = (n: number) => Math.round(n * 1000) / 1000

const SELECT_EMPRESTIMO = `
  SELECT e.*, COUNT(i.id) AS total_itens,
    COALESCE(SUM(i.quantidade - i.devolvida - i.nao_devolvida), 0) AS pendente,
    CASE WHEN e.status='ABERTO' AND e.previsao_devolucao IS NOT NULL AND e.previsao_devolucao < date('now','localtime') THEN 1 ELSE 0 END AS atrasado
  FROM emprestimos e LEFT JOIN emprestimo_itens i ON i.emprestimo_id=e.id
`

export function listarEmprestimos(): Emprestimo[] {
  return getDb().prepare(`${SELECT_EMPRESTIMO} GROUP BY e.id ORDER BY e.status='DEVOLVIDO', e.id DESC`).all() as Emprestimo[]
}

export function obterEmprestimo(id: number): EmprestimoDetalhe {
  const db = getDb()
  const e = db.prepare(`${SELECT_EMPRESTIMO} WHERE e.id=? GROUP BY e.id`).get(id) as Emprestimo | undefined
  if (!e) throw new Error('Empréstimo não encontrado')
  const itens = db.prepare('SELECT id, produto_id, produto_nome, unidade, quantidade, devolvida, nao_devolvida FROM emprestimo_itens WHERE emprestimo_id=? ORDER BY id').all(id) as ItemEmprestimo[]
  return { ...e, itens }
}

function dataValida(valor: unknown) {
  const d = texto(valor)
  if (!d) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Data de devolução inválida')
  return d
}

export type EmprestimoInput = {
  funcionario_id?: unknown
  retirado_por?: unknown
  setor_id?: unknown
  setor?: unknown
  previsao_devolucao?: unknown
  observacao?: unknown
  itens: ItemInput[]
}

export function criarEmprestimo(input: EmprestimoInput) {
  const db = getDb()
  return db.transaction(() => {
    const destino = resolverDestino(input)
    if (!destino.retirado_por) throw new Error('Informe quem está pegando o material')
    if (!Array.isArray(input.itens) || !input.itens.length) throw new Error('Adicione pelo menos um material')
    const itens = consolidarItens(input.itens)
    const numero = proximoNumero('EMP', 'emprestimos')
    const [usuarioId, usuarioNome] = autor()

    const id = Number(db.prepare(`
      INSERT INTO emprestimos (numero, retirado_por, funcionario_id, setor, setor_id, previsao_devolucao, observacao, usuario_nome)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(numero, destino.retirado_por, destino.funcionario_id, destino.setor, destino.setor_id, dataValida(input.previsao_devolucao), texto(input.observacao), usuarioNome).lastInsertRowid)

    const item = db.prepare('INSERT INTO emprestimo_itens (emprestimo_id, produto_id, produto_nome, unidade, quantidade) VALUES (?,?,?,?,?)')
    const baixa = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual-? WHERE id=?')
    const mov = db.prepare(`
      INSERT INTO movimentacoes (produto_id, tipo, quantidade, responsavel, observacao, emprestimo_id, origem, usuario_id, usuario_nome)
      VALUES (?, 'SAIDA', ?, ?, ?, ?, 'EMPRESTIMO', ?, ?)
    `)
    for (const i of itens) {
      const p = disponibilidade(i.produto_id)
      if (!p.ativo) throw new Error(`O material ${p.nome} está inativo`)
      if (p.disponivel < i.quantidade) throw new Error(`Quantidade indisponível: ${p.nome}. Disponível: ${p.disponivel} ${p.unidade}.`)
      item.run(id, p.id, p.nome, p.unidade, i.quantidade)
      baixa.run(i.quantidade, p.id)
      mov.run(p.id, i.quantidade, destino.retirado_por, `Empréstimo ${numero}`, id, usuarioId, usuarioNome)
    }
    return id
  })()
}

export type DevolucaoInput = {
  itens: Array<{ item_id: unknown; devolvida?: unknown; nao_devolvida?: unknown }>
  observacao?: unknown
}

/**
 * Registra a devolução (total ou parcial). O que volta entra no estoque;
 * o que é marcado como não devolvido só fecha a pendência (o material já tinha saído).
 */
export function devolverEmprestimo(id: number, input: DevolucaoInput) {
  const db = getDb()
  return db.transaction(() => {
    const e = obterEmprestimo(id)
    if (e.status === 'DEVOLVIDO') throw new Error('Este empréstimo já foi devolvido')
    if (!Array.isArray(input.itens) || !input.itens.length) throw new Error('Informe o que foi devolvido')
    const obs = texto(input.observacao)
    const [usuarioId, usuarioNome] = autor()
    const atualizar = db.prepare('UPDATE emprestimo_itens SET devolvida=?, nao_devolvida=? WHERE id=?')
    const entrada = db.prepare('UPDATE produtos SET quantidade_atual=quantidade_atual+? WHERE id=?')
    const mov = db.prepare(`
      INSERT INTO movimentacoes (produto_id, tipo, quantidade, responsavel, observacao, emprestimo_id, origem, usuario_id, usuario_nome)
      VALUES (?, 'ENTRADA', ?, ?, ?, ?, 'DEVOLUCAO', ?, ?)
    `)

    let algo = false
    for (const d of input.itens) {
      const item = e.itens.find(i => i.id === Number(d.item_id))
      if (!item) throw new Error('Item do empréstimo não encontrado')
      const volta = Number(d.devolvida || 0)
      const perde = Number(d.nao_devolvida || 0)
      if (!Number.isFinite(volta) || !Number.isFinite(perde) || volta < 0 || perde < 0) throw new Error('Quantidade inválida')
      if (!volta && !perde) continue
      const pendente = arred(item.quantidade - item.devolvida - item.nao_devolvida)
      if (arred(volta + perde) > pendente) throw new Error(`${item.produto_nome}: só há ${pendente} ${item.unidade} pendente(s)`)
      atualizar.run(arred(item.devolvida + volta), arred(item.nao_devolvida + perde), item.id)
      if (volta > 0) {
        entrada.run(volta, item.produto_id)
        mov.run(item.produto_id, volta, e.retirado_por, `Devolução do empréstimo ${e.numero}${obs ? ' - ' + obs : ''}`, id, usuarioId, usuarioNome)
      }
      algo = true
    }
    if (!algo) throw new Error('Informe a quantidade devolvida de pelo menos um item')

    const restante = (db.prepare('SELECT COALESCE(SUM(quantidade - devolvida - nao_devolvida),0) AS r FROM emprestimo_itens WHERE emprestimo_id=?').get(id) as { r: number }).r
    if (arred(restante) <= 0) db.prepare("UPDATE emprestimos SET status='DEVOLVIDO', devolvido_em=CURRENT_TIMESTAMP WHERE id=?").run(id)
    if (obs) db.prepare("UPDATE emprestimos SET observacao=TRIM(COALESCE(observacao || ' | ', '') || ?) WHERE id=?").run(`Devolução: ${obs}`, id)
    return obterEmprestimo(id)
  })()
}
