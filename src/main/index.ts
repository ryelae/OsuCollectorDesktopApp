import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerSettingsHandlers } from './ipc/settings'
import { registerCollectionHandlers } from './ipc/collection'
import { registerCollectionWriterHandlers } from './ipc/collectionWriter'
import { registerWebAppHandlers } from './ipc/webApp'
import { registerOsuApiHandlers } from './ipc/osuApi'
import { registerDownloadHandlers } from './ipc/download'
import { registerSizesHandlers } from './ipc/sizes'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'osu! Collection Hub',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open external links in the OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerSettingsHandlers()
  registerCollectionHandlers()
  registerCollectionWriterHandlers()
  registerWebAppHandlers()
  registerOsuApiHandlers()
  registerDownloadHandlers()
  registerSizesHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
