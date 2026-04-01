import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getDb } from './db/database'
import { registerIpcHandlers } from './ipc-handlers'
import { browserService } from './services/browser-service'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: false required — Phase 03 preload needs Node APIs (child_process for Camoufox spawn)
      // revisit after Phase 03 architecture is confirmed
      sandbox: false,
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Dev: load Vite dev server
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  getDb() // eager init — ensures DB + migrations run before any IPC handler fires
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  browserService.stopAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
