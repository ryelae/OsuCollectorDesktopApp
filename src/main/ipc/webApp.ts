import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import { store } from '../store'
import type { UploadSummary, UploadDetail, IpcResponse } from '../../shared/types'

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

async function apiFetch<T>(path: string): Promise<T> {
  const { webAppUrl, webAppPassword } = store.store
  if (!webAppUrl) throw new Error('Web app URL not configured')

  const base = webAppUrl.replace(/\/$/, '')
  const authHash = hashPassword(webAppPassword)

  const res = await fetch(`${base}${path}`, {
    headers: {
      Cookie: `osu_hub_auth=${authHash}`,
      'Content-Type': 'application/json'
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as T
}

export function registerWebAppHandlers(): void {
  ipcMain.handle('webApp:listUploads', async (): Promise<IpcResponse<UploadSummary[]>> => {
    try {
      const data = await apiFetch<UploadSummary[]>('/api/uploads')
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('webApp:getUpload', async (_e, id: string): Promise<IpcResponse<UploadDetail>> => {
    try {
      const data = await apiFetch<UploadDetail>(`/api/uploads/${id}`)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'webApp:getCollectionHashes',
    async (_e, uploadId: string, collectionId: string): Promise<IpcResponse<string[]>> => {
      try {
        const data = await apiFetch<{ hashes: string[] }>(
          `/api/uploads/${uploadId}/collections/${collectionId}/hashes`
        )
        return { ok: true, data: data.hashes }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    }
  )

  /** Verify connectivity + auth */
  ipcMain.handle('webApp:ping', async (): Promise<IpcResponse<boolean>> => {
    try {
      await apiFetch<unknown>('/api/uploads')
      return { ok: true, data: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
