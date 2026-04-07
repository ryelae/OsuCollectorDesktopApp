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
      console.log(`collection:addHashes → writing to "${dbPath}", collection="${collectionName}", hashes=${hashes.length}`)
      try {
        const added = addHashesToCollection(dbPath, collectionName, hashes)
        console.log(`collection:addHashes → added ${added} new hashes`)
        return { ok: true, data: { added } }
      } catch (err) {
        console.error(`collection:addHashes → error:`, err)
        return { ok: false, error: String(err) }
      }
    }
  )
}
