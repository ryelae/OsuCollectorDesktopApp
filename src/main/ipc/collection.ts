import { ipcMain } from 'electron'
import { parseCollectionDb } from '../utils/collectionParser'
import type { ParsedCollectionDb, IpcResponse } from '../../shared/types'

export function registerCollectionHandlers(): void {
  ipcMain.handle('collection:parse', (_e, filePath: string): IpcResponse<ParsedCollectionDb> => {
    try {
      const result = parseCollectionDb(filePath)
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
