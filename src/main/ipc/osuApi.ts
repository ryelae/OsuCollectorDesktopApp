import { ipcMain } from 'electron'
import { store } from '../store'
import type { MissingMap, IpcResponse } from '../../shared/types'

const OSU_API_BASE = 'https://osu.ppy.sh/api'

/**
 * Resolve a single MD5 hash → beatmapset ID via osu! API v1.
 * Returns null on 404 / not-found.
 */
async function resolveHash(hash: string, apiKey: string): Promise<{ beatmapsetId: number; title: string; artist: string } | null> {
  const url = `${OSU_API_BASE}/get_beatmaps?k=${encodeURIComponent(apiKey)}&h=${encodeURIComponent(hash)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`osu! API HTTP ${res.status}`)
  const maps = await res.json() as Array<{ beatmapset_id: string; title: string; artist: string }>
  if (!maps.length) return null
  return {
    beatmapsetId: parseInt(maps[0].beatmapset_id, 10),
    title: maps[0].title,
    artist: maps[0].artist
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Resolve a batch of hashes with controlled concurrency.
 * Sends progress events back to the renderer via BrowserWindow.webContents.
 */
export function registerOsuApiHandlers(): void {
  ipcMain.handle(
    'osuApi:resolveHashes',
    async (
      event,
      hashes: string[]
    ): Promise<IpcResponse<MissingMap[]>> => {
      const apiKey = store.get('osuApiKey')
      if (!apiKey) return { ok: false, error: 'osu! API key not configured' }

      const CONCURRENCY = 5
      const DELAY_MS = 200  // 200 ms between each request within a slot

      const results: MissingMap[] = hashes.map((hash) => ({ hash, beatmapsetId: null }))
      let completed = 0

      // Process in chunks of CONCURRENCY
      for (let i = 0; i < hashes.length; i += CONCURRENCY) {
        const chunk = hashes.slice(i, i + CONCURRENCY)
        await Promise.all(
          chunk.map(async (hash, j) => {
            await sleep(j * DELAY_MS) // stagger within the chunk
            try {
              const resolved = await resolveHash(hash, apiKey)
              const idx = i + j
              if (resolved) {
                results[idx].beatmapsetId = resolved.beatmapsetId
                results[idx].title = resolved.title
                results[idx].artist = resolved.artist
              }
            } catch {
              // leave beatmapsetId as null — UI will show as unresolved
            }
            completed++
            event.sender.send('osuApi:resolveProgress', { completed, total: hashes.length })
          })
        )
        // Small inter-chunk pause to be polite to the API
        if (i + CONCURRENCY < hashes.length) await sleep(300)
      }

      return { ok: true, data: results }
    }
  )
}
