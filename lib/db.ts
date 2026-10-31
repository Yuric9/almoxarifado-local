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
  adicionarColunaSeFaltar(db, 'requisicoes', 'cancelada_em', 'TEXT')
  adicionarColunaSeFaltar(db, 'requisicoes', 'motivo_cancelamento', 'TEXT')
  adicionarColunaSeFaltar(db, 'produtos', 'codigo', 'TEXT')
  adicionarColunaSeFaltar(db, 'produtos', 'localizacao', 'TEXT')
  adicionarColunaSeFaltar(db, 'produtos', 'ativo', 'INTEGER NOT NULL DEFAULT 1')
  adicionarColunaSeFaltar(db, 'movimentacoes', 'motivo', 'TEXT')

  // Usuários e sessões (login). As senhas ficam só como hash (scrypt), nunca em texto.
  db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK (perfil IN ('ADMIN','ALMOXARIFE','CONSULTA')),
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em TEXT NOT NULL
  );
  `)
  // Quem registrou cada movimentação, retirada e reserva (preenchido pelo login).
  adicionarColunaSeFaltar(db, 'movimentacoes', 'usuario_id', 'INTEGER REFERENCES usuarios(id)')
  adicionarColunaSeFaltar(db, 'movimentacoes', 'usuario_nome', 'TEXT')
  adicionarColunaSeFaltar(db, 'requisicoes', 'usuario_nome', 'TEXT')
  adicionarColunaSeFaltar(db, 'reservas', 'usuario_nome', 'TEXT')

  // Setores/obras (destino do material) e funcionários (quem retira).
  db.exec(`
  CREATE TABLE IF NOT EXISTS setores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
    tipo TEXT NOT NULL DEFAULT 'SETOR' CHECK (tipo IN ('SETOR','OBRA')),
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS funcionarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    matricula TEXT UNIQUE COLLATE NOCASE,
    funcao TEXT,
    setor_id INTEGER REFERENCES setores(id),
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `)
  adicionarColunaSeFaltar(db, 'requisicoes', 'setor_id', 'INTEGER REFERENCES setores(id)')
  adicionarColunaSeFaltar(db, 'requisicoes', 'funcionario_id', 'INTEGER REFERENCES funcionarios(id)')
  vincularSetoresDoHistorico(db)

  // EPI (NR-6): o material guarda o CA vigente; cada entrega guarda o CA da época.
  const epiNovo = !colunaExiste(db, 'produtos', 'epi')
  adicionarColunaSeFaltar(db, 'produtos', 'epi', 'INTEGER NOT NULL DEFAULT 0')
  adicionarColunaSeFaltar(db, 'produtos', 'ca', 'TEXT')
  adicionarColunaSeFaltar(db, 'produtos', 'ca_validade', 'TEXT')
  adicionarColunaSeFaltar(db, 'produtos', 'troca_dias', 'INTEGER')
  adicionarColunaSeFaltar(db, 'requisicao_itens', 'ca', 'TEXT')
  if (epiNovo) {
    db.exec("UPDATE produtos SET epi=1 WHERE categoria_id IN (SELECT id FROM categorias WHERE nome='EPI' COLLATE NOCASE)")
  }

  // Empréstimo de ferramentas: sai do estoque e volta na devolução (o que não volta fica registrado como não devolvido).
  db.exec(`
  CREATE TABLE IF NOT EXISTS emprestimos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    retirado_por TEXT NOT NULL,
    funcionario_id INTEGER REFERENCES funcionarios(id),
    setor TEXT,
    setor_id INTEGER REFERENCES setores(id),
    previsao_devolucao TEXT,
    observacao TEXT,
    status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','DEVOLVIDO')),
    usuario_nome TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    devolvido_em TEXT
  );
  CREATE TABLE IF NOT EXISTS emprestimo_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emprestimo_id INTEGER NOT NULL REFERENCES emprestimos(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    produto_nome TEXT NOT NULL,
    unidade TEXT NOT NULL,
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    devolvida REAL NOT NULL DEFAULT 0,
    nao_devolvida REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON emprestimos(status);
  CREATE INDEX IF NOT EXISTS idx_emprestimo_itens_emprestimo ON emprestimo_itens(emprestimo_id);
  `)
  adicionarColunaSeFaltar(db, 'movimentacoes', 'emprestimo_id', 'INTEGER REFERENCES emprestimos(id)')

  db.exec(`
  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  `)

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
  CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes(criado_em);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos(codigo) WHERE codigo IS NOT NULL;
  `)
}

function colunaExiste(db: DB, tabela: string, coluna: string) {
  return (db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>).some(c => c.name === coluna)
}

/**
 * Retiradas antigas tinham o setor só como texto. Cria os setores que ainda não existem
 * (sem diferenciar maiúsculas) e liga as retiradas a eles, para o consumo por setor valer
 * também para o histórico. Só mexe em retiradas ainda sem setor_id.
 */
function vincularSetoresDoHistorico(db: DB) {
  const pendentes = db.prepare("SELECT id, TRIM(setor) AS setor FROM requisicoes WHERE setor_id IS NULL AND TRIM(COALESCE(setor,''))<>''").all() as Array<{ id: number; setor: string }>
  if (!pendentes.length) return
  const buscar = db.prepare('SELECT id FROM setores WHERE nome=? COLLATE NOCASE')
  const criar = db.prepare('INSERT INTO setores (nome) VALUES (?)')
  const ligar = db.prepare('UPDATE requisicoes SET setor_id=? WHERE id=?')
  db.transaction(() => {
    for (const r of pendentes) {
      const nome = r.setor.replace(/\s+/g, ' ')
      const existente = buscar.get(nome) as { id: number } | undefined
      ligar.run(existente?.id ?? Number(criar.run(nome).lastInsertRowid), r.id)
    }
  })()
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
