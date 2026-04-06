import { ipcMain } from 'electron'
import { addHashesToCollection } from '../utils/collectionWriter'
import type { IpcResponse } from '../../shared/types'

export function registerCollectionWriterHandlers(): void {
  ipcMain.handle(
    'collection:addHashes',
    (
      _e,
      dbPath: string,
      collectionName: string,
      hashes: string[]
    ): IpcResponse<{ added: number }> => {
      try {
        const added = addHashesToCollection(dbPath, collectionName, hashes)
        return { ok: true, data: { added } }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    }
  )
}
