import { useEffect, useState } from 'react'
import type { UploadSummary } from '../../../shared/types'

interface Props {
  onGoToSettings: () => void
  onGoToImport: () => void
}

interface Stats {
  uploads: number
  collections: number
  maps: number
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

const Step = ({ n, title, body }: { n: number; title: string; body: string }) => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
    <div style={{
      flexShrink: 0,
      width: 28, height: 28,
      borderRadius: '50%',
      background: 'var(--brand-500)',
      color: '#fff',
      fontSize: 13,
      fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>{n}</div>
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-900)', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-600)', lineHeight: 1.5 }}>{body}</div>
    </div>
  </div>
)

const StatCard = ({ label, value }: { label: string; value: number | string }) => (
  <div className="card" style={{ flex: 1, padding: '16px 20px', textAlign: 'center' }}>
    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-900)' }}>{value}</div>
    <div style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 4 }}>{label}</div>
  </div>
)

export default function WelcomeView({ onGoToSettings, onGoToImport }: Props): JSX.Element {
  const [connected, setConnected] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentUploads, setRecentUploads] = useState<UploadSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkConnection()
  }, [])

  async function checkConnection() {
    setLoading(true)
    const pingRes = await window.api.pingWebApp()
    if (!pingRes.ok) { setConnected(false); setLoading(false); return }
    setConnected(true)

    const uploadsRes = await window.api.listUploads()
    if (uploadsRes.ok) {
      const uploads = uploadsRes.data
      setRecentUploads(uploads.slice(0, 5))
      setStats({
        uploads: uploads.length,
        collections: uploads.reduce((a, u) => a + u.collectionCount, 0),
        maps: uploads.reduce((a, u) => a + u.totalMaps, 0)
      })
    }
    setLoading(false)
  }

  return (
    <div className="scroll-area" style={{ height: '100%', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-900)', marginBottom: 6 }}>
            osu! Collection Hub
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-600)' }}>
            Browse and import your friends' osu! stable collections. Maps are downloaded directly from osu!'s servers and written straight into your local collection.db.
          </p>
        </div>

        {/* Stats — only shown when connected */}
        {connected && stats && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <StatCard label="Uploads" value={stats.uploads} />
            <StatCard label="Collections" value={stats.collections} />
            <StatCard label="Map entries" value={stats.maps.toLocaleString()} />
          </div>
        )}

        {/* Connection status banner */}
        {!connected && !loading && (
          <div className="card" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-900)' }}>Not connected</div>
              <div style={{ fontSize: 12, color: 'var(--text-500)', marginTop: 2 }}>Configure your web app URL and password in Settings.</div>
            </div>
            <button className="btn-primary" style={{ fontSize: 13, flexShrink: 0 }} onClick={onGoToSettings}>
              Open Settings
            </button>
          </div>
        )}

        {/* Getting Started */}
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-700)', marginBottom: 16 }}>
            Getting started
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Step
              n={1}
              title="Connect to the web app"
              body="Open Settings → Web App Connection. Enter the URL and shared password your friend gave you, then click Test Connection to confirm it works."
            />
            <Step
              n={2}
              title="Get an osu! API v1 key"
              body="Go to osu.ppy.sh/p/api, log in, fill in any app name and URL, and copy the key you get. Paste it into Settings → osu! API Key. This lets the app look up which beatmapset a map belongs to."
            />
            <Step
              n={3}
              title="Log in to osu! for direct downloads"
              body="Go to osu.ppy.sh/home/account/edit, scroll down to OAuth Applications, and click New OAuth Application. Give it any name, set the callback URL exactly to http://127.0.0.1/osu-hub-callback, then click Register. Copy the Client ID and Client Secret into Settings → osu! Account, then click Log in to osu! — a browser window will open for you to approve access."
            />
            <Step
              n={4}
              title="Set your Songs folder and import"
              body="In Settings → osu! Songs Folder, click Auto-detect. Then go to Import Collections, pick a collection, and click Download & Import. When it finishes, press F5 in osu! to scan for new maps, then fully restart osu! to see the new collection."
            />
          </div>
        </div>

        {/* Recent uploads */}
        {connected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-700)' }}>Recent uploads</span>
              {recentUploads.length > 0 && (
                <button
                  onClick={onGoToImport}
                  style={{ fontSize: 12, color: 'var(--brand-500)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Browse all →
                </button>
              )}
            </div>

            {loading && (
              <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-400)' }}>Loading…</span>
              </div>
            )}

            {!loading && recentUploads.length === 0 && (
              <div className="card" style={{ padding: '24px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-500)', marginBottom: 12 }}>
                  No uploads yet. Ask a friend to upload their collection.db on the web app.
                </p>
                <button className="btn-primary" style={{ fontSize: 13 }} onClick={onGoToImport}>
                  Go to Import Collections
                </button>
              </div>
            )}

            {!loading && recentUploads.length > 0 && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="divide-list">
                  {recentUploads.map((u) => (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex', alignItems: 'center',
                        padding: '10px 16px', gap: 12,
                        cursor: 'pointer', transition: 'background 150ms'
                      }}
                      onClick={onGoToImport}
                      onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = 'var(--btn-secondary-hover)'}
                      onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-900)' }}>{u.uploaderName}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-400)', marginLeft: 8 }}>{timeAgo(u.createdAt)}</span>
                      </div>
                      <span className="badge badge-pink">{u.collectionCount} collections</span>
                      <span className="badge badge-slate">{u.totalMaps.toLocaleString()} maps</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
