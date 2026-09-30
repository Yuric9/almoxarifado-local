import path from 'node:path'
import fs from 'node:fs'

/**
 * Pasta onde ficam o banco e os backups.
 *
 * O processo Electron define ALMOXARIFADO_DATA_DIR:
 * - versão portátil / HD: pasta "Almoxarifado-Dados" ao lado do executável;
 * - versão instalada: pasta de dados do usuário do Windows.
 * Em desenvolvimento, usa ./data na raiz do projeto.
 */
export function pastaDados() {
  const dir = process.env.ALMOXARIFADO_DATA_DIR || path.join(process.cwd(), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function arquivoBanco() {
  return path.join(pastaDados(), 'almoxarifado.db')
}

export function pastaBackups() {
  const dir = path.join(pastaDados(), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
