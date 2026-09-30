import Database from 'better-sqlite3'
import { arquivoBanco } from './paths'

type DB = Database.Database

let conexao: DB | null = null

/**
 * Abre o banco na primeira utilização (nunca durante o `next build`)
 * e reaproveita a mesma conexão nas próximas chamadas.
 */
export function getDb(): DB {
  if (conexao) return conexao
  const db = new Database(arquivoBanco())
  // Modo DELETE mantém tudo em um único arquivo .db, o que é mais seguro
  // para HD externo/pendrive (não sobram arquivos -wal/-shm ao desconectar).
  db.pragma('journal_mode = DELETE')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrar(db)
  conexao = db
  return db
}

export function fecharBanco() {
  if (!conexao) return
  conexao.close()
  conexao = null
}

function migrar(db: DB) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    cor TEXT DEFAULT '#2563EB'
  );
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria_id INTEGER REFERENCES categorias(id),
    quantidade_atual REAL NOT NULL DEFAULT 0,
    estoque_minimo REAL NOT NULL DEFAULT 5,
    unidade TEXT NOT NULL DEFAULT 'UN',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SAIDA')),
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    responsavel TEXT,
    observacao TEXT,
    requisicao_id INTEGER REFERENCES requisicoes(id),
    origem TEXT NOT NULL DEFAULT 'MANUAL',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS requisicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    retirado_por TEXT NOT NULL,
    setor TEXT,
    finalidade TEXT,
    entregue_por TEXT,
    observacao TEXT,
    reserva_id INTEGER REFERENCES reservas(id),
    status TEXT NOT NULL DEFAULT 'FINALIZADA' CHECK (status IN ('FINALIZADA','CANCELADA')),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    finalidade TEXT NOT NULL,
    reservado_por TEXT,
    observacao TEXT,
    status TEXT NOT NULL DEFAULT 'SEPARADO' CHECK (status IN ('SEPARADO','AGUARDANDO_RETIRADA','RETIRADO','CANCELADO')),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reserva_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reserva_id INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    unidade TEXT NOT NULL,
    produto_nome TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS requisicao_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    unidade TEXT NOT NULL,
    produto_nome TEXT NOT NULL
  );
  `)

  migrarReservasLegadas(db)
  adicionarColunaSeFaltar(db, 'movimentacoes', 'requisicao_id', 'INTEGER REFERENCES requisicoes(id)')
  adicionarColunaSeFaltar(db, 'movimentacoes', 'origem', "TEXT NOT NULL DEFAULT 'MANUAL'")
  adicionarColunaSeFaltar(db, 'requisicoes', 'reserva_id', 'INTEGER REFERENCES reservas(id)')

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM categorias').get() as { total: number }
  if (total === 0) {
    const insert = db.prepare('INSERT INTO categorias (nome, cor) VALUES (?, ?)')
    const padrao = [['Ferramentas', '#F59E0B'], ['Elétrica', '#2563EB'], ['Hidráulica', '#0EA5E9'], ['Limpeza', '#16A34A'], ['Geral', '#64748B']]
    for (const [nome, cor] of padrao) insert.run(nome, cor)
  }

  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON movimentacoes(produto_id);
  CREATE INDEX IF NOT EXISTS idx_movimentacoes_requisicao ON movimentacoes(requisicao_id);
  CREATE INDEX IF NOT EXISTS idx_reserva_itens_produto ON reserva_itens(produto_id);
  CREATE INDEX IF NOT EXISTS idx_reservas_status ON reservas(status);
  CREATE INDEX IF NOT EXISTS idx_requisicao_itens_requisicao ON requisicao_itens(requisicao_id);
  `)
}

function colunaExiste(db: DB, tabela: string, coluna: string) {
  return (db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>).some(c => c.name === coluna)
}

function adicionarColunaSeFaltar(db: DB, tabela: string, coluna: string, definicao: string) {
  if (!colunaExiste(db, tabela, coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`)
}

const STATUS_LEGADO: Record<string, string> = {
  RESERVADA: 'SEPARADO',
  RETIRADA: 'RETIRADO',
  CANCELADA: 'CANCELADO'
}

/** Converte bancos antigos cujo CHECK de status usava RESERVADA/RETIRADA/CANCELADA. */
function migrarReservasLegadas(db: DB) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reservas'").get() as { sql?: string } | undefined
  const sql = row?.sql || ''
  const legado = Object.keys(STATUS_LEGADO).some(s => sql.includes(`'${s}'`))
  if (!legado) return

  const rows = db.prepare('SELECT id, numero, finalidade, reservado_por, observacao, status, criado_em FROM reservas').all() as Array<{
    id: number; numero: string; finalidade: string; reservado_por: string | null; observacao: string | null; status: string; criado_em: string
  }>

  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec('DROP TABLE reservas')
      db.exec(`
        CREATE TABLE reservas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero TEXT NOT NULL UNIQUE,
          finalidade TEXT NOT NULL,
          reservado_por TEXT,
          observacao TEXT,
          status TEXT NOT NULL DEFAULT 'SEPARADO'
            CHECK (status IN ('SEPARADO','AGUARDANDO_RETIRADA','RETIRADO','CANCELADO')),
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      const insert = db.prepare('INSERT INTO reservas (id,numero,finalidade,reservado_por,observacao,status,criado_em) VALUES (?,?,?,?,?,?,?)')
      for (const r of rows) {
        insert.run(r.id, r.numero, r.finalidade, r.reservado_por, r.observacao, STATUS_LEGADO[r.status] ?? r.status, r.criado_em)
      }
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }
}
