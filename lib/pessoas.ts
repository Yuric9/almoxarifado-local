import { getDb } from './db'

/**
 * Setores/obras (para onde vai o material) e funcionários (quem retira).
 * Não há exclusão: quem saiu ou o setor que acabou é desativado, para o histórico continuar íntegro.
 */

export type TipoSetor = 'SETOR' | 'OBRA'
export type Setor = { id: number; nome: string; tipo: TipoSetor; ativo: number; total_funcionarios: number; total_retiradas: number }
export type Funcionario = {
  id: number
  nome: string
  matricula: string | null
  funcao: string | null
  setor_id: number | null
  setor: string | null
  ativo: number
  total_retiradas: number
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null)

/* ------------------------------------------------------------------ setores */

export function listarSetores(): Setor[] {
  return getDb().prepare(`
    SELECT s.id, s.nome, s.tipo, s.ativo,
      (SELECT COUNT(*) FROM funcionarios f WHERE f.setor_id=s.id AND f.ativo=1) AS total_funcionarios,
      (SELECT COUNT(*) FROM requisicoes r WHERE r.setor_id=s.id AND r.status='FINALIZADA') AS total_retiradas
    FROM setores s ORDER BY s.ativo DESC, s.nome COLLATE NOCASE
  `).all() as Setor[]
}

function tipoValido(v: unknown): TipoSetor {
  return v === 'OBRA' ? 'OBRA' : 'SETOR'
}

export function criarSetor(input: { nome: unknown; tipo?: unknown }) {
  const nome = texto(input.nome)
  if (!nome) throw new Error('Informe o nome do setor ou obra')
  const db = getDb()
  if (db.prepare('SELECT 1 FROM setores WHERE nome=? COLLATE NOCASE').get(nome)) throw new Error(`"${nome}" já está cadastrado`)
  return Number(db.prepare('INSERT INTO setores (nome, tipo) VALUES (?,?)').run(nome, tipoValido(input.tipo)).lastInsertRowid)
}

export function atualizarSetor(id: number, input: { nome?: unknown; tipo?: unknown; ativo?: unknown }) {
  const db = getDb()
  const atual = db.prepare('SELECT * FROM setores WHERE id=?').get(id) as Setor | undefined
  if (!atual) throw new Error('Setor não encontrado')
  const nome = input.nome === undefined ? atual.nome : texto(input.nome)
  if (!nome) throw new Error('Informe o nome do setor ou obra')
  if (db.prepare('SELECT 1 FROM setores WHERE nome=? COLLATE NOCASE AND id<>?').get(nome, id)) throw new Error(`"${nome}" já está cadastrado`)
  db.prepare('UPDATE setores SET nome=?, tipo=?, ativo=? WHERE id=?').run(
    nome,
    input.tipo === undefined ? atual.tipo : tipoValido(input.tipo),
    input.ativo === undefined ? atual.ativo : input.ativo ? 1 : 0,
    id
  )
}

/* ------------------------------------------------------------------ funcionários */

export function listarFuncionarios(): Funcionario[] {
  return getDb().prepare(`
    SELECT f.id, f.nome, f.matricula, f.funcao, f.setor_id, s.nome AS setor, f.ativo,
      (SELECT COUNT(*) FROM requisicoes r WHERE r.funcionario_id=f.id AND r.status='FINALIZADA') AS total_retiradas
    FROM funcionarios f LEFT JOIN setores s ON s.id=f.setor_id
    ORDER BY f.ativo DESC, f.nome COLLATE NOCASE
  `).all() as Funcionario[]
}

function setorValido(v: unknown) {
  if (v === undefined || v === null || v === '') return null
  const id = Number(v)
  if (!getDb().prepare('SELECT 1 FROM setores WHERE id=?').get(id)) throw new Error('Setor inválido')
  return id
}

function matriculaLivre(matricula: string | null, ignorarId = 0) {
  if (matricula && getDb().prepare('SELECT 1 FROM funcionarios WHERE matricula=? COLLATE NOCASE AND id<>?').get(matricula, ignorarId)) {
    throw new Error(`A matrícula ${matricula} já pertence a outro funcionário`)
  }
}

export function criarFuncionario(input: { nome: unknown; matricula?: unknown; funcao?: unknown; setor_id?: unknown }) {
  const nome = texto(input.nome)
  if (!nome) throw new Error('Informe o nome do funcionário')
  const matricula = texto(input.matricula)
  matriculaLivre(matricula)
  const db = getDb()
  return db.transaction(() => {
    const id = Number(db.prepare('INSERT INTO funcionarios (nome, matricula, funcao, setor_id) VALUES (?,?,?,?)')
      .run(nome, matricula, texto(input.funcao), setorValido(input.setor_id)).lastInsertRowid)
    // Retiradas antigas com exatamente esse nome passam a ser dele (entram no consumo e na ficha de EPI).
    // Se já existir outro funcionário com o mesmo nome, não dá para saber de quem eram: fica como está.
    const homonimos = (db.prepare('SELECT COUNT(*) AS n FROM funcionarios WHERE nome=? COLLATE NOCASE').get(nome) as { n: number }).n
    if (homonimos === 1) {
      db.prepare('UPDATE requisicoes SET funcionario_id=? WHERE funcionario_id IS NULL AND TRIM(retirado_por)=? COLLATE NOCASE').run(id, nome)
    }
    return id
  })()
}

export function atualizarFuncionario(id: number, input: { nome?: unknown; matricula?: unknown; funcao?: unknown; setor_id?: unknown; ativo?: unknown }) {
  const db = getDb()
  const atual = db.prepare('SELECT * FROM funcionarios WHERE id=?').get(id) as Funcionario | undefined
  if (!atual) throw new Error('Funcionário não encontrado')
  const nome = input.nome === undefined ? atual.nome : texto(input.nome)
  if (!nome) throw new Error('Informe o nome do funcionário')
  const matricula = input.matricula === undefined ? atual.matricula : texto(input.matricula)
  matriculaLivre(matricula, id)
  db.prepare('UPDATE funcionarios SET nome=?, matricula=?, funcao=?, setor_id=?, ativo=? WHERE id=?').run(
    nome,
    matricula,
    input.funcao === undefined ? atual.funcao : texto(input.funcao),
    input.setor_id === undefined ? atual.setor_id : setorValido(input.setor_id),
    input.ativo === undefined ? atual.ativo : input.ativo ? 1 : 0,
    id
  )
}

/* ------------------------------------------------------------------ vínculo na retirada */

/**
 * Descobre funcionário e setor de uma retirada:
 * - funcionário pelo id ou, se só veio o nome, pelo nome igual a um cadastrado;
 * - setor pelo id, pelo nome igual a um cadastrado ou, sem nada informado, o setor do funcionário.
 * Devolve também os textos (nome e setor) gravados na retirada, para o comprovante e o histórico.
 */
export function resolverDestino(input: { funcionario_id?: unknown; retirado_por?: unknown; setor_id?: unknown; setor?: unknown }) {
  const db = getDb()
  let funcionario: { id: number; nome: string; setor_id: number | null; ativo: number } | undefined
  if (input.funcionario_id) {
    funcionario = db.prepare('SELECT id, nome, setor_id, ativo FROM funcionarios WHERE id=?').get(Number(input.funcionario_id)) as typeof funcionario
    if (!funcionario) throw new Error('Funcionário não encontrado')
    if (!funcionario.ativo) throw new Error(`${funcionario.nome} está desativado`)
  } else if (texto(input.retirado_por)) {
    funcionario = db.prepare('SELECT id, nome, setor_id, ativo FROM funcionarios WHERE nome=? COLLATE NOCASE AND ativo=1').get(texto(input.retirado_por)) as typeof funcionario
  }

  let setor: { id: number; nome: string } | undefined
  if (input.setor_id) {
    setor = db.prepare('SELECT id, nome FROM setores WHERE id=?').get(Number(input.setor_id)) as typeof setor
    if (!setor) throw new Error('Setor inválido')
  } else if (texto(input.setor)) {
    setor = db.prepare('SELECT id, nome FROM setores WHERE nome=? COLLATE NOCASE').get(texto(input.setor)) as typeof setor
  } else if (funcionario?.setor_id) {
    setor = db.prepare('SELECT id, nome FROM setores WHERE id=?').get(funcionario.setor_id) as typeof setor
  }

  return {
    funcionario_id: funcionario?.id ?? null,
    retirado_por: funcionario?.nome ?? texto(input.retirado_por),
    setor_id: setor?.id ?? null,
    setor: setor?.nome ?? texto(input.setor)
  }
}
