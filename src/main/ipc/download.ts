import { ipcMain } from 'electron'
import { createWriteStream, mkdirSync, unlinkSync, openSync, readSync, closeSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import { store } from '../store'
import type { DownloadItem, IpcResponse } from '../../shared/types'

function getMirrors(noVideo: boolean): ((id: number) => string)[] {
  const mirrors: ((id: number) => string)[] = [
    (id) => `https://api.nerinyan.moe/d/${id}?noVideo=${noVideo ? 1 : 0}`,
  ]
  // If the no-video version doesn't exist on nerinyan's CDN, fall back to the full version
  if (noVideo) {
    mirrors.push((id) => `https://api.nerinyan.moe/d/${id}?noVideo=0`)
  }
  mirrors.push(
    (id) => `https://osu.direct/api/d/${id}${noVideo ? '?noVideo=1' : ''}`,
    (id) => `https://beatconnect.io/b/${id}`
  )
  return mirrors
}

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
        console.log(`  → ${res.statusCode} ${currentUrl.slice(0, 80)}`)
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
          // Resolve relative redirect URLs against the current URL
          let nextUrl: string
          try {
            nextUrl = new URL(res.headers.location, currentUrl).href
          } catch {
            reject(new Error(`Invalid redirect URL: ${res.headers.location}`))
            return
          }
          attempt(nextUrl, redirectsLeft - 1)
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

async function downloadOne(beatmapsetId: number, destFolder: string, noVideo: boolean): Promise<void> {
  mkdirSync(destFolder, { recursive: true })
  const destPath = join(destFolder, `${beatmapsetId}.osz`)

  const errors: string[] = []
  for (const mirror of getMirrors(noVideo)) {
    const url = mirror(beatmapsetId)
    console.log(`[download] #${beatmapsetId} trying ${url}`)
    try {
      await downloadToFile(url, destPath)
      if (!isValidZip(destPath)) {
        const size = (() => { try { return require('fs').statSync(destPath).size } catch { return '?' } })()
        unlinkSync(destPath)
        throw new Error(`Not a valid zip (got ${size} bytes — likely an error page)`)
      }
      const size = require('fs').statSync(destPath).size
      console.log(`[download] #${beatmapsetId} OK from ${url} (${(size / 1024 / 1024).toFixed(1)} MB)`)
      return // success
    } catch (err) {
      console.warn(`[download] #${beatmapsetId} FAILED ${url}: ${err}`)
      errors.push(`${url}: ${err}`)
    }
  }
  console.error(`[download] #${beatmapsetId} all mirrors failed:\n  ${errors.join('\n  ')}`)
  throw new Error(`All mirrors failed for beatmapset ${beatmapsetId}:\n${errors.join('\n')}`)
}

export function registerDownloadHandlers(): void {
  ipcMain.handle(
    'download:start',
    async (event, items: DownloadItem[]): Promise<IpcResponse<{ failed: number[] }>> => {
      const songsFolder = store.get('songsFolder')
      if (!songsFolder) return { ok: false, error: 'Songs folder not configured' }
      const noVideo = store.get('noVideo') ?? true

      const failed: number[] = []
      const CONCURRENCY = 3

      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const chunk = items.slice(i, i + CONCURRENCY)
        await Promise.all(
          chunk.map(async (item) => {
            event.sender.send('download:progress', { beatmapsetId: item.beatmapsetId, status: 'downloading' })
            try {
              await downloadOne(item.beatmapsetId, songsFolder, noVideo)
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
