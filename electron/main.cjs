const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged
const port = process.env.PORT || 3000

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.once('ready-to-show', () => win.show())
  const url = isDev ? 'http://localhost:' + port : 'http://localhost:3000'
  win.loadURL(url)
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
