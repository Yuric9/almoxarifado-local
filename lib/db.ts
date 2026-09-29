import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

const dataDir = process.env.ALMOXARIFADO_DATA_DIR || path.join(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const db = new Database(path.join(dataDir, 'almoxarifado.db'))
db.pragma('journal_mode = WAL')

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
  status TEXT NOT NULL DEFAULT 'FINALIZADA' CHECK (status IN ('FINALIZADA','CANCELADA')),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reservas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  finalidade TEXT NOT NULL,
  reservado_por TEXT,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'RESERVADA' CHECK (status IN ('RESERVADA','CANCELADA','RETIRADA')),
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

const count = db.prepare('SELECT COUNT(*) AS total FROM categorias').get() as { total:number }
if (count.total === 0) {
  const insert = db.prepare('INSERT INTO categorias (nome, cor) VALUES (?, ?)')
  for (const [nome, cor] of [['Ferramentas','#F59E0B'],['Elétrica','#2563EB'],['Hidráulica','#0EA5E9'],['Limpeza','#16A34A'],['Geral','#64748B']]) insert.run(nome, cor)
}
