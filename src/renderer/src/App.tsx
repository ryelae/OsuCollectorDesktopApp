import { useEffect, useState } from 'react'
import SettingsPanel from './components/SettingsPanel'
import CompareView from './components/CompareView'

type Tab = 'import' | 'settings'

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
  </svg>
)

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

function getInitialDark(): boolean {
  const stored = localStorage.getItem('theme')
  if (stored) return stored === 'dark'
  return true // dark by default
}

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('import')
  const [dark, setDark] = useState(getInitialDark)

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 224,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>⭕</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-900)', lineHeight: 1.2 }}>
                Collection Hub
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 1 }}>osu! stable</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {([
            { id: 'import', label: 'Import Collections', Icon: UploadIcon },
            { id: 'settings', label: 'Settings', Icon: SettingsIcon }
          ] as { id: Tab; label: string; Icon: () => JSX.Element }[]).map(({ id, label, Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: active ? 'var(--brand-50)' : 'transparent',
                  color: active ? 'var(--brand-700)' : 'var(--text-600)',
                  fontWeight: active ? 500 : 400,
                  fontSize: 14,
                  border: 'none',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 150ms, color 150ms'
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--btn-secondary-hover)' }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span style={{ color: active ? 'var(--brand-500)' : 'var(--text-400)', flexShrink: 0 }}>
                  <Icon />
                </span>
                {label}
              </button>
            )
          })}
        </nav>

        {/* Footer — theme toggle + label */}
        <div style={{
          padding: '12px',
          borderTop: '1px solid var(--divider)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-400)' }}>Private · 2025</span>
          <button
            onClick={() => setDark((d) => !d)}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'var(--divider)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              color: 'var(--text-500)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'import' && <CompareView onGoToSettings={() => setTab('settings')} />}
        {tab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}
