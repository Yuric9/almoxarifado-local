const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

const HOST = '127.0.0.1'
const PASTA_DADOS_PORTATIL = 'Almoxarifado-Dados'
const DEV_URL = process.env.ALMOXARIFADO_DEV_URL || 'http://127.0.0.1:3000'

let serverProcess = null
let janela = null
let encerrando = false

/* ------------------------------------------------------------------ dados */

function podeEscrever(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const teste = path.join(dir, '.teste-escrita')
    fs.writeFileSync(teste, 'ok')
    fs.rmSync(teste)
    return true
  } catch {
    return false
  }
}

/**
 * Decide onde ficam banco e backups.
 *
 * - ALMOXARIFADO_DATA_DIR definido: usa esse caminho.
 * - Executável portátil (.exe único): pasta ao lado do .exe (PORTABLE_EXECUTABLE_DIR).
 * - Versão ZIP/pasta (sem desinstalador ao lado do .exe): pasta ao lado do .exe.
 * - Versão instalada (NSIS): pasta de dados do usuário do Windows.
 *
 * Assim, ao levar o HD para outro computador, os dados vão junto,
 * mesmo que a letra da unidade mude (E:, F:...).
 */
function resolverPastaDados() {
  if (process.env.ALMOXARIFADO_DATA_DIR) return { dir: process.env.ALMOXARIFADO_DATA_DIR, modo: 'portatil' }
  if (!app.isPackaged) return { dir: path.join(__dirname, '..', 'data'), modo: 'desenvolvimento' }

  const instalado = path.join(app.getPath('userData'), 'data')
  const pastaExe = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
  const temDesinstalador = !process.env.PORTABLE_EXECUTABLE_DIR &&
    fs.readdirSync(pastaExe).some(nome => /^Uninstall .*\.exe$/i.test(nome))

  if (!temDesinstalador) {
    const portatil = path.join(pastaExe, PASTA_DADOS_PORTATIL)
    if (podeEscrever(portatil)) return { dir: portatil, modo: 'portatil' }
  }
  return { dir: instalado, modo: 'instalado' }
}

/* ------------------------------------------------------------------ servidor */

function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, HOST, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function iniciarServidor(porta, dados) {
  const appDir = app.getAppPath()
  const nextBin = path.join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  const logDir = path.join(dados.dir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const log = fs.openSync(path.join(logDir, 'servidor.log'), 'a')
  fs.writeSync(log, `\n==== ${new Date().toISOString()} · v${app.getVersion()} · porta ${porta}\n`)

  serverProcess = spawn(process.execPath, [nextBin, 'start', '-H', HOST, '-p', String(porta)], {
    cwd: appDir,
    env: {
      ...process.env,
      ALMOXARIFADO_DATA_DIR: dados.dir,
      ALMOXARIFADO_MODO: dados.modo,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      ELECTRON_RUN_AS_NODE: '1'
    },
    windowsHide: true,
    stdio: ['ignore', log, log]
  })

  serverProcess.on('exit', code => {
    serverProcess = null
    if (!encerrando) {
      dialog.showErrorBox('Almoxarifado Local', `O servidor interno parou (código ${code}).\nVeja o log em:\n${path.join(logDir, 'servidor.log')}`)
      app.quit()
    }
  })
}

function aguardarServidor(url, timeoutMs = 60000) {
  const inicio = Date.now()
  return new Promise((resolve, reject) => {
    const tentar = () => {
      const req = http.get(url, res => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) resolve()
        else repetir()
      })
      req.on('error', repetir)
      req.setTimeout(2000, () => req.destroy())
    }
    const repetir = () => {
      if (Date.now() - inicio >= timeoutMs) reject(new Error('O servidor local não iniciou dentro do tempo esperado.'))
      else setTimeout(tentar, 300)
    }
    tentar()
  })
}

function pararServidor() {
  encerrando = true
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
}

/* ------------------------------------------------------------------ janela */

function criarJanela(url) {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Almoxarifado Local',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const origem = new URL(url).origin
  // Links externos abrem no navegador padrão; a janela nunca sai do app.
  janela.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (/^https?:/i.test(destino)) shell.openExternal(destino)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (evento, destino) => {
    if (new URL(destino).origin !== origem) {
      evento.preventDefault()
      if (/^https?:/i.test(destino)) shell.openExternal(destino)
    }
  })

  janela.once('ready-to-show', () => janela.show())
  janela.on('closed', () => { janela = null })
  return janela.loadURL(url)
}

/* ------------------------------------------------------------------ ciclo de vida */

if (!app.requestSingleInstanceLock()) {
  // Já existe uma janela aberta: evita dois processos usando o mesmo banco.
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!janela) return
    if (janela.isMinimized()) janela.restore()
    janela.focus()
  })

  app.whenReady().then(async () => {
    try {
      let url = DEV_URL
      if (app.isPackaged) {
        const dados = resolverPastaDados()
        const porta = await portaLivre()
        url = `http://${HOST}:${porta}`
        iniciarServidor(porta, dados)
      }
      await aguardarServidor(url)
      await criarJanela(url)
    } catch (erro) {
      dialog.showErrorBox('Almoxarifado Local', `Não foi possível iniciar o programa.\n\n${erro instanceof Error ? erro.message : erro}`)
      pararServidor()
      app.quit()
    }
  })
}

app.on('before-quit', pararServidor)
app.on('window-all-closed', () => app.quit())
