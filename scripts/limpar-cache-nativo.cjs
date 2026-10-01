// O @electron/rebuild grava ".forge-meta" ao compilar o SQLite para o Electron e,
// se o arquivo existir, pula a recompilação. Depois de "npm run rebuild:node" o
// binário volta a ser do Node, mas a marca continua lá — e o pacote sairia quebrado.
// Apagar a marca garante que o empacotamento sempre recompila para o Electron.
const fs = require('node:fs')
const path = require('node:path')

const marca = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', '.forge-meta')
fs.rmSync(marca, { force: true })
