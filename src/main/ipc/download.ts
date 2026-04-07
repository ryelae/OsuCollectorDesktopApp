import { ipcMain } from 'electron'
import { createWriteStream, mkdirSync, unlinkSync, openSync, readSync, closeSync, statSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import { store } from '../store'
import { getValidOsuToken } from './osuAuth'
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
function downloadToFile(url: string, destPath: string, extraHeaders: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl: string, redirectsLeft: number) => {
      const mod = currentUrl.startsWith('https') ? https : http
      const req = mod.get(currentUrl, {
        headers: {
          'User-Agent': 'osu-collector-desktop/0.1',
          'Accept': 'application/octet-stream, */*',
          ...extraHeaders
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

function fileSizeMB(filePath: string): string {
  try { return (statSync(filePath).size / 1024 / 1024).toFixed(1) + ' MB' } catch { return '?' }
}

async function tryDownload(url: string, destPath: string, extraHeaders: Record<string, string> = {}): Promise<void> {
  await downloadToFile(url, destPath, extraHeaders)
  if (!isValidZip(destPath)) {
    const size = (() => { try { return statSync(destPath).size } catch { return '?' } })()
    try { unlinkSync(destPath) } catch { /* ignore */ }
    throw new Error(`Not a valid zip (got ${size} bytes — likely an error page)`)
  }
}

async function downloadOne(beatmapsetId: number, destFolder: string, noVideo: boolean): Promise<void> {
  mkdirSync(destFolder, { recursive: true })
  const destPath = join(destFolder, `${beatmapsetId}.osz`)

  const errors: string[] = []

  // Try osu! official servers first (requires OAuth login)
  const token = await getValidOsuToken()
  if (token) {
    const url = `https://osu.ppy.sh/beatmapsets/${beatmapsetId}/download${noVideo ? '?noVideo=1' : ''}`
    console.log(`[download] #${beatmapsetId} trying osu! official`)
    try {
      await tryDownload(url, destPath, { 'Authorization': `Bearer ${token}` })
      console.log(`[download] #${beatmapsetId} OK from osu! official (${fileSizeMB(destPath)})`)
      return
    } catch (err) {
      console.warn(`[download] #${beatmapsetId} osu! official failed: ${err}`)
      errors.push(`osu! official: ${err}`)
    }
  }

  // Fall back to public mirrors
  for (const mirror of getMirrors(noVideo)) {
    const url = mirror(beatmapsetId)
    console.log(`[download] #${beatmapsetId} trying ${url}`)
    try {
      await tryDownload(url, destPath)
      console.log(`[download] #${beatmapsetId} OK from ${url} (${fileSizeMB(destPath)})`)
      return
    } catch (err) {
      console.warn(`[download] #${beatmapsetId} FAILED ${url}: ${err}`)
      errors.push(`${url}: ${err}`)
    }
  }

  console.error(`[download] #${beatmapsetId} all sources failed:\n  ${errors.join('\n  ')}`)
  throw new Error(`All sources failed for beatmapset ${beatmapsetId}:\n${errors.join('\n')}`)
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
