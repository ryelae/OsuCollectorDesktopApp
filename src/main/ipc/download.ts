import { ipcMain } from 'electron'
import { createWriteStream, mkdirSync, unlinkSync, openSync, readSync, closeSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import { store } from '../store'
import type { DownloadItem, IpcResponse } from '../../shared/types'

const MIRRORS = [
  (id: number) => `https://api.nerinyan.moe/d/${id}`,
  (id: number) => `https://catboy.best/d/${id}`,
  (id: number) => `https://api.chimu.moe/v1/download/${id}?n=1`,
  (id: number) => `https://beatconnect.io/b/${id}`
]

/**
 * Download a URL to a file path, following redirects, using Node https/http.
 * Returns a rejected promise if the final status is not 2xx.
 */
function downloadToFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl: string, redirectsLeft: number) => {
      const mod = currentUrl.startsWith('https') ? https : http
      const req = mod.get(currentUrl, {
        headers: {
          'User-Agent': 'osu-collector-desktop/0.1',
          'Accept': 'application/octet-stream, */*'
        }
      }, (res) => {
        // Follow redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'))
            return
          }
          res.resume() // drain
          attempt(res.headers.location, redirectsLeft - 1)
          return
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const file = createWriteStream(destPath)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', (err) => {
          try { unlinkSync(destPath) } catch { /* ignore */ }
          reject(err)
        })
        res.on('error', (err) => {
          try { unlinkSync(destPath) } catch { /* ignore */ }
          reject(err)
        })
      })

      req.on('error', reject)
      req.setTimeout(60000, () => {
        req.destroy(new Error('Request timed out'))
      })
    }

    attempt(url, 5)
  })
}

/** Check that a file starts with PK (zip magic bytes 0x50 0x4B) */
function isValidZip(filePath: string): boolean {
  try {
    const buf = Buffer.alloc(4)
    const fd = openSync(filePath, 'r')
    readSync(fd, buf, 0, 4, 0)
    closeSync(fd)
    return buf[0] === 0x50 && buf[1] === 0x4b
  } catch {
    return false
  }
}

async function downloadOne(beatmapsetId: number, destFolder: string): Promise<void> {
  mkdirSync(destFolder, { recursive: true })
  const destPath = join(destFolder, `${beatmapsetId}.osz`)

  const errors: string[] = []
  for (const mirror of MIRRORS) {
    const url = mirror(beatmapsetId)
    try {
      await downloadToFile(url, destPath)
      if (!isValidZip(destPath)) {
        unlinkSync(destPath)
        throw new Error('Not a valid zip (likely an error page)')
      }
      return // success
    } catch (err) {
      errors.push(`${url}: ${err}`)
    }
  }
  throw new Error(`All mirrors failed for beatmapset ${beatmapsetId}:\n${errors.join('\n')}`)
}

export function registerDownloadHandlers(): void {
  ipcMain.handle(
    'download:start',
    async (event, items: DownloadItem[]): Promise<IpcResponse<{ failed: number[] }>> => {
      const songsFolder = store.get('songsFolder')
      if (!songsFolder) return { ok: false, error: 'Songs folder not configured' }

      const failed: number[] = []
      const CONCURRENCY = 3

      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const chunk = items.slice(i, i + CONCURRENCY)
        await Promise.all(
          chunk.map(async (item) => {
            event.sender.send('download:progress', { beatmapsetId: item.beatmapsetId, status: 'downloading' })
            try {
              await downloadOne(item.beatmapsetId, songsFolder)
              event.sender.send('download:progress', { beatmapsetId: item.beatmapsetId, status: 'done' })
            } catch (err) {
              failed.push(item.beatmapsetId)
              event.sender.send('download:progress', {
                beatmapsetId: item.beatmapsetId,
                status: 'error',
                error: String(err)
              })
            }
          })
        )
      }

      return { ok: true, data: { failed } }
    }
  )
}
