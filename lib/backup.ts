import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fecharBanco, getDb } from './db'
import { lerConfiguracoes } from './configuracoes'
import { arquivoBanco, pastaBackups } from './paths'

export type BackupInfo = { nome: string; tamanho: number; criado_em: string }

function carimbo(data = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}_${p(data.getHours())}-${p(data.getMinutes())}-${p(data.getSeconds())}`
}

/** Gera uma cópia consistente do banco (VACUUM INTO) na pasta de backups. */
export function criarBackup(prefixo = 'manual') {
  const destino = path.join(pastaBackups(), `almoxarifado-${prefixo}-${carimbo()}.db`)
  fs.rmSync(destino, { force: true })
  getDb().prepare('VACUUM INTO ?').run(destino)
  return destino
}

export function listarBackups(): BackupInfo[] {
  const dir = pastaBackups()
  return fs.readdirSync(dir)
    .filter(nome => nome.endsWith('.db'))
    .map(nome => {
      const stat = fs.statSync(path.join(dir, nome))
      return { nome, tamanho: stat.size, criado_em: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
}

/** Um backup automático por dia, mantendo apenas os mais recentes. */
export function backupAutomaticoDiario() {
  const hoje = carimbo().slice(0, 10)
  const existentes = listarBackups().filter(b => b.nome.startsWith('almoxarifado-auto-'))
  if (existentes.some(b => b.nome.startsWith(`almoxarifado-auto-${hoje}`))) return null
  const criado = criarBackup('auto')
  for (const antigo of existentes.slice(lerConfiguracoes().backups_manter - 1)) {
    fs.rmSync(path.join(pastaBackups(), antigo.nome), { force: true })
  }
  return criado
}

const TABELAS_OBRIGATORIAS = ['produtos', 'movimentacoes', 'categorias']

function validarArquivoBanco(arquivo: string) {
  let teste: Database.Database | null = null
  try {
    teste = new Database(arquivo, { readonly: true, fileMustExist: true })
    const integridade = teste.pragma('integrity_check', { simple: true })
    if (integridade !== 'ok') throw new Error('O arquivo de backup está corrompido')
    const tabelas = (teste.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(t => t.name)
    const faltando = TABELAS_OBRIGATORIAS.filter(t => !tabelas.includes(t))
    if (faltando.length) throw new Error('O arquivo não é um backup do Almoxarifado')
  } catch (e) {
    if (e instanceof Error && /not a database|file is (encrypted|not)/i.test(e.message)) {
      throw new Error('O arquivo enviado não é um banco SQLite válido')
    }
    throw e
  } finally {
    teste?.close()
  }
}

/**
 * Substitui o banco atual pelo conteúdo enviado.
 * Antes, salva automaticamente uma cópia do banco atual em backups/.
 */
export function restaurarBackup(conteudo: Buffer) {
  const principal = arquivoBanco()
  const temporario = `${principal}.restaurando`
  fs.writeFileSync(temporario, conteudo)
  try {
    validarArquivoBanco(temporario)
    const seguranca = criarBackup('antes-da-restauracao')
    fecharBanco()
    for (const extra of ['-wal', '-shm', '-journal']) fs.rmSync(principal + extra, { force: true })
    fs.copyFileSync(temporario, principal)
    getDb() // reabre e aplica migrações (backups antigos são atualizados)
    return { backupAnterior: path.basename(seguranca) }
  } finally {
    fs.rmSync(temporario, { force: true })
  }
}
