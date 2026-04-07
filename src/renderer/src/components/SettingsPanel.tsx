import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/types'

type PingState = 'idle' | 'loading' | 'ok' | 'fail'
type LoginState = 'idle' | 'loading' | 'ok' | 'fail'

export default function SettingsPanel(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>({
    webAppUrl: '',
    webAppPassword: '',
    osuApiKey: '',
    songsFolder: '',
    noVideo: true,
    osuClientId: '',
    osuClientSecret: '',
    osuAccessToken: '',
    osuRefreshToken: '',
    osuTokenExpiry: 0
  })
  const [pingState, setPingState] = useState<PingState>('idle')
  const [pingError, setPingError] = useState('')
  const [saved, setSaved] = useState(false)
  const [detectMsg, setDetectMsg] = useState('')
  const [osuLoggedIn, setOsuLoggedIn] = useState(false)
  const [loginState, setLoginState] = useState<LoginState>('idle')
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.osuAuthGetStatus().then((s) => setOsuLoggedIn(s.loggedIn))
  }, [])

  async function osuLogin() {
    await save()  // save client id/secret first
    setLoginState('loading')
    setLoginError('')
    const res = await window.api.osuAuthLogin()
    if (res.ok) {
      setOsuLoggedIn(true)
      setLoginState('ok')
    } else {
      setLoginState('fail')
      setLoginError(res.error)
    }
  }

  async function osuLogout() {
    await window.api.osuAuthLogout()
    setOsuLoggedIn(false)
    setLoginState('idle')
    setLoginError('')
  }

  async function save() {
    await window.api.setSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function detectFolder() {
    setDetectMsg('Detecting…')
    const res = await window.api.detectSongsFolder()
    if (res.ok) {
      setSettings((s) => ({ ...s, songsFolder: res.data }))
      setDetectMsg('Found!')
    } else {
      setDetectMsg('Not found — browse manually')
    }
    setTimeout(() => setDetectMsg(''), 3000)
  }

  async function browseFolder() {
    const res = await window.api.browseSongsFolder()
    if (res.ok) setSettings((s) => ({ ...s, songsFolder: res.data }))
  }

  async function pingWebApp() {
    setPingState('loading')
    setPingError('')
    const res = await window.api.pingWebApp()
    setPingState(res.ok ? 'ok' : 'fail')
    if (!res.ok) setPingError(res.error)
  }

  const SectionHeading = ({ children }: { children: string }) => (
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-700)', marginBottom: 12 }}>
      {children}
    </div>
  )

  return (
    <div className="scroll-area" style={{ flex: 1, padding: 32, height: '100%' }}>
      <div style={{ maxWidth: 540 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-900)', marginBottom: 24 }}>Settings</h1>

        {/* Web App */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <SectionHeading>Web App Connection</SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Web App URL</label>
              <input
                value={settings.webAppUrl}
                placeholder="https://your-app.fly.dev"
                onChange={(e) => setSettings((s) => ({ ...s, webAppUrl: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Shared Password</label>
              <input
                type="password"
                value={settings.webAppPassword}
                placeholder="••••••••"
                onChange={(e) => setSettings((s) => ({ ...s, webAppPassword: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn-secondary" onClick={pingWebApp} disabled={pingState === 'loading'} style={{ fontSize: 13 }}>
                {pingState === 'loading' ? 'Testing…' : 'Test Connection'}
              </button>
              {pingState === 'ok' && <span className="badge badge-green">Connected</span>}
              {pingState === 'fail' && (
                <span className="badge badge-red" title={pingError}>Failed — {pingError}</span>
              )}
            </div>
          </div>
        </div>

        {/* osu! API */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <SectionHeading>osu! API</SectionHeading>
          <div className="field">
            <label>API v1 Key</label>
            <input
              value={settings.osuApiKey}
              placeholder="Get from osu.ppy.sh/p/api"
              onChange={(e) => setSettings((s) => ({ ...s, osuApiKey: e.target.value }))}
            />
          </div>
        </div>

        {/* osu! Account (OAuth) */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <SectionHeading>osu! Account</SectionHeading>
          <p style={{ fontSize: 12, color: 'var(--text-500)', marginBottom: 12, lineHeight: 1.6 }}>
            Log in to download maps directly from osu!. Create an OAuth app at{' '}
            <strong style={{ color: 'var(--text-700)' }}>osu.ppy.sh/home/account/edit</strong>{' '}
            → OAuth Applications → New OAuth Application. Set the callback URL to{' '}
            <code style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>
              http://127.0.0.1/osu-hub-callback
            </code>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Client ID</label>
              <input
                value={settings.osuClientId}
                placeholder="12345"
                onChange={(e) => setSettings((s) => ({ ...s, osuClientId: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Client Secret</label>
              <input
                type="password"
                value={settings.osuClientSecret}
                placeholder="••••••••••••••••"
                onChange={(e) => setSettings((s) => ({ ...s, osuClientSecret: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {osuLoggedIn ? (
                <>
                  <span className="badge badge-green">Logged in</span>
                  <button className="btn-secondary" onClick={osuLogout} style={{ fontSize: 13 }}>
                    Log out
                  </button>
                </>
              ) : (
                <button
                  className="btn-primary"
                  onClick={osuLogin}
                  disabled={loginState === 'loading'}
                  style={{ fontSize: 13 }}
                >
                  {loginState === 'loading' ? 'Opening login…' : 'Log in to osu!'}
                </button>
              )}
              {loginState === 'ok' && <span className="badge badge-green">Connected!</span>}
              {loginState === 'fail' && (
                <span style={{ fontSize: 12, color: 'var(--red-600)' }}>{loginError}</span>
              )}
            </div>
          </div>
        </div>

        {/* Songs folder */}
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <SectionHeading>osu! Songs Folder</SectionHeading>
          <div className="field">
            <label>Songs folder path</label>
            <div className="field-row">
              <input
                value={settings.songsFolder}
                placeholder="C:\Users\you\AppData\Local\osu!\Songs"
                onChange={(e) => setSettings((s) => ({ ...s, songsFolder: e.target.value }))}
              />
              <button className="btn-secondary" onClick={detectFolder} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                Auto-detect
              </button>
              <button className="btn-secondary" onClick={browseFolder} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                Browse…
              </button>
            </div>
            {detectMsg && (
              <span style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 4 }}>{detectMsg}</span>
            )}
          </div>
        </div>

        {/* Downloads */}
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <SectionHeading>Downloads</SectionHeading>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 0 }}>
            <input
              type="checkbox"
              checked={settings.noVideo}
              onChange={(e) => setSettings((s) => ({ ...s, noVideo: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-500)', cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-900)' }}>Skip video downloads (WIP!)</div>
              <div style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 2 }}>
                Downloads maps without background videos — significantly smaller file sizes. Sizes shown in the app will match.
              </div>
            </div>
          </label>
        </div>

        <button className="btn-primary" onClick={save}>
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
