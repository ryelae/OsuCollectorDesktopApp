import { ipcMain, BrowserWindow } from 'electron'
import { store } from '../store'
import type { IpcResponse } from '../../shared/types'

const REDIRECT_URI = 'http://127.0.0.1/osu-hub-callback'
const TOKEN_URL = 'https://osu.ppy.sh/oauth/token'

/**
 * Returns a valid access token, refreshing it if expired.
 * Returns null if not logged in or refresh fails.
 */
export async function getValidOsuToken(): Promise<string | null> {
  const accessToken = store.get('osuAccessToken')
  const refreshToken = store.get('osuRefreshToken')
  const expiry = store.get('osuTokenExpiry')

  if (!accessToken || !refreshToken) return null

  // Still valid (with 5-min buffer)
  if (expiry && Date.now() < expiry - 5 * 60 * 1000) return accessToken

  // Attempt refresh
  const clientId = store.get('osuClientId')
  const clientSecret = store.get('osuClientSecret')
  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    store.set('osuAccessToken', data.access_token)
    store.set('osuRefreshToken', data.refresh_token)
    store.set('osuTokenExpiry', Date.now() + data.expires_in * 1000)
    console.log('[osuAuth] token refreshed successfully')
    return data.access_token
  } catch (err) {
    console.warn('[osuAuth] token refresh failed:', err)
    store.set('osuAccessToken', '')
    store.set('osuRefreshToken', '')
    store.set('osuTokenExpiry', 0)
    return null
  }
}

export function registerOsuAuthHandlers(): void {
  ipcMain.handle('osuAuth:getStatus', () => {
    const loggedIn = !!store.get('osuAccessToken')
    const expiry = store.get('osuTokenExpiry') as number
    return { loggedIn, expiry }
  })

  ipcMain.handle('osuAuth:login', (): Promise<IpcResponse<boolean>> => {
    const clientId = store.get('osuClientId')
    const clientSecret = store.get('osuClientSecret')
    if (!clientId || !clientSecret) {
      return Promise.resolve({ ok: false, error: 'Enter your Client ID and Client Secret first' })
    }

    return new Promise((resolve) => {
      let settled = false
      const done = (result: IpcResponse<boolean>) => {
        if (settled) return
        settled = true
        resolve(result)
      }

      const authWin = new BrowserWindow({
        width: 820,
        height: 700,
        title: 'Log in to osu!',
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      const authUrl =
        `https://osu.ppy.sh/oauth/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=public`

      authWin.loadURL(authUrl)

      const handleCallback = async (url: string) => {
        if (!url.startsWith('http://127.0.0.1')) return

        // Claim the resolution immediately so the 'closed' event can't race us
        settled = true

        const code = new URL(url).searchParams.get('code')
        if (!code) {
          authWin.destroy()
          resolve({ ok: false, error: 'No authorization code in redirect' })
          return
        }

        try {
          const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              grant_type: 'authorization_code',
              redirect_uri: REDIRECT_URI
            })
          })
          if (!res.ok) {
            const body = await res.text().catch(() => '')
            authWin.destroy()
            resolve({ ok: false, error: `Token exchange failed (HTTP ${res.status}): ${body}` })
            return
          }
          const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
          store.set('osuAccessToken', data.access_token)
          store.set('osuRefreshToken', data.refresh_token)
          store.set('osuTokenExpiry', Date.now() + data.expires_in * 1000)
          console.log('[osuAuth] logged in successfully')
          authWin.destroy()
          resolve({ ok: true, data: true })
        } catch (err) {
          authWin.destroy()
          resolve({ ok: false, error: String(err) })
        }
      }

      authWin.webContents.on('will-redirect', (event, url) => {
        if (url.startsWith('http://127.0.0.1')) {
          event.preventDefault()
          handleCallback(url)
        }
      })

      authWin.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('http://127.0.0.1')) {
          event.preventDefault()
          handleCallback(url)
        }
      })

      authWin.on('closed', () => done({ ok: false, error: 'Login window closed' }))
    })
  })

  ipcMain.handle('osuAuth:logout', () => {
    store.set('osuAccessToken', '')
    store.set('osuRefreshToken', '')
    store.set('osuTokenExpiry', 0)
    console.log('[osuAuth] logged out')
  })
}
