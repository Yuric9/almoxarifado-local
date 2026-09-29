const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

let serverProcess

function startNextServer() {
  const appDir = path.join(process.resourcesPath, 'app')
  const nextBin = path.join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  const dataDir = path.join(app.getPath('userData'), 'data')
  const env = { ...process.env, ALMOXARIFADO_DATA_DIR: dataDir, NODE_ENV: 'production' }
  serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', '3000'], { cwd: appDir, env, windowsHide: true })
  serverProcess.on('error', (err) => console.error('Next server error:', err))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.once('ready-to-show', () => win.show())
  win.loadURL('http://localhost:3000')
}

app.whenReady().then(() => {
  startNextServer()
  setTimeout(createWindow, 1500)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('before-quit', () => { if (serverProcess) serverProcess.kill() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
