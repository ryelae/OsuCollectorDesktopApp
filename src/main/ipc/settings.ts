import { ipcMain, dialog } from 'electron'
import { store } from '../store'
import { detectOsuSongsFolder, isSongsFolderWritable, getInstalledBeatmapsetIds } from '../utils/osuPath'
import type { AppSettings, IpcResponse } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (): AppSettings => {
    return store.store
  })

  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>): void => {
    for (const [k, v] of Object.entries(partial) as [keyof AppSettings, string][]) {
      store.set(k, v)
    }
  })

  ipcMain.handle('settings:detectSongsFolder', async (): Promise<IpcResponse<string>> => {
    const folder = await detectOsuSongsFolder()
    if (folder) return { ok: true, data: folder }
    return { ok: false, error: 'Could not auto-detect osu! Songs folder' }
  })

  ipcMain.handle('settings:browseSongsFolder', async (): Promise<IpcResponse<string>> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'Cancelled' }
    }
    const folder = result.filePaths[0]
    if (!isSongsFolderWritable(folder)) {
      return { ok: false, error: 'Selected folder is not readable' }
    }
    return { ok: true, data: folder }
  })

  ipcMain.handle('settings:getInstalledIds', (_e, songsFolder: string): IpcResponse<number[]> => {
    try {
      const ids = getInstalledBeatmapsetIds(songsFolder)
      console.log(`getInstalledIds: scanned "${songsFolder}", found ${ids.size} beatmapsets`)
      return { ok: true, data: Array.from(ids) }
    } catch (err) {
      console.error('getInstalledIds error:', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('settings:browseCollectionDb', async (): Promise<IpcResponse<string>> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'osu! Collection DB', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'Cancelled' }
    }
    return { ok: true, data: result.filePaths[0] }
  })
}
