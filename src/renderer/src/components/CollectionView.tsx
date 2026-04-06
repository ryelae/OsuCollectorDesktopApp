import { useState } from 'react'
import type { ParsedCollectionDb } from '../../../shared/types'

interface Props {
  localDb: { path: string; db: ParsedCollectionDb } | null
  onDbLoaded: (loaded: { path: string; db: ParsedCollectionDb }) => void
}

export default function CollectionView({ localDb, onDbLoaded }: Props): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function openDb() {
    const browseRes = await window.api.browseCollectionDb()
    if (!browseRes.ok) return
    setLoading(true)
    setError('')
    const parseRes = await window.api.parseCollectionDb(browseRes.data)
    setLoading(false)
    if (!parseRes.ok) {
      setError(parseRes.error)
      return
    }
    onDbLoaded({ path: browseRes.data, db: parseRes.data })
  }

  if (!localDb) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>No collection.db loaded yet</p>
        <button className="btn-primary" onClick={openDb} disabled={loading}>
          {loading ? 'Parsing…' : 'Open collection.db…'}
        </button>
        {error && <p style={{ color: 'var(--error)', fontSize: 13 }}>{error}</p>}
      </div>
    )
  }

  const { path, db } = localDb
  const totalMaps = db.collections.reduce((acc, c) => acc + c.beatmapHashes.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={path}>
          {path}
        </span>
        <span className="tag">v{db.version}</span>
        <span className="tag">{db.collections.length} collections</span>
        <span className="tag">{totalMaps.toLocaleString()} maps</span>
        <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={openDb}>
          Change…
        </button>
      </div>

      {/* Collection list */}
      <div className="scroll-area" style={{ flex: 1, padding: '12px 16px' }}>
        {db.collections.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: 16 }}>No collections found in this file.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>#</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>Collection Name</th>
                <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Maps</th>
              </tr>
            </thead>
            <tbody>
              {db.collections.map((col, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 8px', color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
                  <td style={{ padding: '8px 8px' }}>{col.name || <em style={{ color: 'var(--text-muted)' }}>Unnamed</em>}</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>
                    {col.beatmapHashes.length.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
