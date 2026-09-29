const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

let serverProcess

function startNextServer() {
  const nextBin = process.platform === 'win32'
    ? path.join(process.resourcesPath, 'app', 'node_modules', 'next', 'dist', 'bin', 'next')
    : path.join(process.resourcesPath, 'app', 'node_modules', 'next', 'dist', 'bin', 'next')
  const cwd = path.join(process.resourcesPath, 'app')
  const dataDir = path.join(app.getPath('userData'), 'data')
  const env = { ...process.env, ALMOXARIFADO_DATA_DIR: dataDir }
  serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', '3000'], { cwd, env, windowsHide: true })
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
  if (app.isPackaged) startNextServer()
  setTimeout(createWindow, app.isPackaged ? 1200 : 0)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
