import { ipcMain } from 'electron'
import https from 'https'
import http from 'http'
import { store } from '../store'
import type { IpcResponse } from '../../shared/types'

function getMirrors(noVideo: boolean): ((id: number) => string)[] {
  const nv = noVideo ? 1 : 0
  return [
    (id) => `https://api.nerinyan.moe/d/${id}?noVideo=${nv}`,
    (id) => `https://catboy.best/d/${id}?noVideo=${nv}`,
    (id) => `https://api.chimu.moe/v1/download/${id}?n=${nv}`
  ]
}


/**
 * Send a HEAD request following up to 5 redirects.
 * Returns Content-Length in bytes, or null if unavailable.
 */
function headRequest(url: string, redirectsLeft = 5): Promise<number | null> {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.request(url, { method: 'HEAD', headers: { 'User-Agent': 'osu-collector-desktop/0.1' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft <= 0) { resolve(null); return }
        headRequest(res.headers.location, redirectsLeft - 1).then(resolve)
        return
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        resolve(null)
        return
      }
      const len = res.headers['content-length']
      res.resume()
      resolve(len ? parseInt(len, 10) : null)
    })
    req.on('error', () => resolve(null))
    req.setTimeout(10000, () => { req.destroy(); resolve(null) })
    req.end()
  })
}

async function fetchSize(beatmapsetId: number, noVideo: boolean): Promise<number | null> {
  for (const mirror of getMirrors(noVideo)) {
    const size = await headRequest(mirror(beatmapsetId))
    if (size && size > 1024) return size // sanity check — real .osz is always > 1KB
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function registerSizesHandlers(): void {
  ipcMain.handle(
    'sizes:fetch',
    async (event, beatmapsetIds: number[]): Promise<IpcResponse<Record<number, number>>> => {
      const noVideo = store.get('noVideo') ?? true
      const CONCURRENCY = 5
      const result: Record<number, number> = {}
      let completed = 0

      for (let i = 0; i < beatmapsetIds.length; i += CONCURRENCY) {
        const chunk = beatmapsetIds.slice(i, i + CONCURRENCY)
        await Promise.all(
          chunk.map(async (id, j) => {
            await sleep(j * 50)
            const size = await fetchSize(id, noVideo)
            if (size) result[id] = size
            completed++
            event.sender.send('sizes:progress', { completed, total: beatmapsetIds.length })
          })
        )
      }

      return { ok: true, data: result }
    }
  )
}
