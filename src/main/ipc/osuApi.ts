import { ipcMain } from 'electron'
import { store } from '../store'
import { getCached, setCached, getCacheSize } from '../hashCache'
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
  if (!maps.length) {
    console.log(`[osuApi] unresolved hash: ${hash} (API returned empty array — map likely removed or never submitted)`)
    return null
  }
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
      const DELAY_MS = 200

      const results: MissingMap[] = hashes.map((hash) => ({ hash, beatmapsetId: null }))
      let completed = 0
      let cacheHits = 0

      // Separate hashes into cache hits and misses
      const toFetch: Array<{ hash: string; idx: number }> = []
      for (let i = 0; i < hashes.length; i++) {
        const cached = getCached(hashes[i])
        if (cached) {
          results[i].beatmapsetId = cached.beatmapsetId
          results[i].title = cached.title
          results[i].artist = cached.artist
          completed++
          cacheHits++
        } else {
          toFetch.push({ hash: hashes[i], idx: i })
        }
      }

      // Report cache hits immediately so progress bar advances
      if (cacheHits > 0) {
        event.sender.send('osuApi:resolveProgress', { completed, total: hashes.length })
        console.log(`[osuApi] ${cacheHits}/${hashes.length} resolved from cache (${getCacheSize()} total cached)`)
      }

      // Fetch remaining from osu! API
      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        const chunk = toFetch.slice(i, i + CONCURRENCY)
        await Promise.all(
          chunk.map(async ({ hash, idx }, j) => {
            await sleep(j * DELAY_MS)
            try {
              const resolved = await resolveHash(hash, apiKey)
              if (resolved) {
                results[idx].beatmapsetId = resolved.beatmapsetId
                results[idx].title = resolved.title
                results[idx].artist = resolved.artist
                setCached(hash, resolved)
              }
            } catch {
              // leave beatmapsetId as null — UI will show as not found
            }
            completed++
            event.sender.send('osuApi:resolveProgress', { completed, total: hashes.length })
          })
        )
        if (i + CONCURRENCY < toFetch.length) await sleep(300)
      }

      const unresolved = results.filter((r) => r.beatmapsetId === null)
      if (unresolved.length > 0) {
        console.log(`[osuApi] ${unresolved.length} unresolved hash(es) after full resolution:`)
        unresolved.forEach((r) => console.log(`  ${r.hash}`))
        console.log(`[osuApi] Possible reasons: map DMCA'd/deleted, local-only difficulty, or modified .osu file`)
      }

      return { ok: true, data: results }
    }
  )
}
