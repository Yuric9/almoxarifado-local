const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const http = require('node:http')

let serverProcess

function startNextServer() {
  const appDir = path.join(process.resourcesPath, 'app')
  const nextBin = path.join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  const dataDir = path.join(app.getPath('userData'), 'data')
  const env = {
    ...process.env,
    ALMOXARIFADO_DATA_DIR: dataDir,
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1'
  }

  serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', '3000'], {
    cwd: appDir,
    env,
    windowsHide: true,
    stdio: 'ignore'
  })

  serverProcess.on('error', (err) => console.error('Next server error:', err))
  serverProcess.on('exit', (code) => {
    if (code !== 0 && !app.isQuitting) console.error('Next server exited with code:', code)
  })
}

function waitForServer(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const check = () => {
      const req = http.get('http://127.0.0.1:3000', (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) return resolve()
        retry()
      })

      req.on('error', retry)
      req.setTimeout(1000, () => req.destroy())
    }

    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('O servidor local não iniciou dentro do tempo esperado.'))
        return
      }
      setTimeout(check, 250)
    }

    check()
  })
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())
  await win.loadURL('http://127.0.0.1:3000')
}

app.whenReady().then(async () => {
  startNextServer()

  try {
    await waitForServer()
    await createWindow()
  } catch (error) {
    console.error(error)
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (serverProcess) serverProcess.kill()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
