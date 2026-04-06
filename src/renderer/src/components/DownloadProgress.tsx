import type { DownloadItem } from '../../../shared/types'

interface Props {
  items: DownloadItem[]
  onBack: () => void
}

export default function DownloadProgress({ items, onBack }: Props): JSX.Element {
  const done = items.filter((i) => i.status === 'done').length
  const errors = items.filter((i) => i.status === 'error').length
  const total = items.length
  const finished = done + errors
  const allDone = finished === total

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: allDone ? 0 : 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-900)', flex: 1 }}>
            Downloading beatmapsets
          </h2>
          <span className="badge badge-slate">{done}/{total} done</span>
          {errors > 0 && <span className="badge badge-red">{errors} failed</span>}
          {allDone && (
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={onBack}>
              Back to results
            </button>
          )}
        </div>

        {!allDone && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-500)', marginBottom: 4 }}>
              <span>Downloading…</span>
              <span>{finished} / {total}</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${(finished / total) * 100}%` }} />
            </div>
          </>
        )}

        {allDone && (
          <div className={errors ? 'alert-error' : 'alert-success'} style={{ marginTop: 10 }}>
            {errors
              ? `Completed with ${errors} error${errors > 1 ? 's' : ''}. ${done} beatmapset${done !== 1 ? 's' : ''} downloaded successfully.`
              : `All ${total} beatmapset${total !== 1 ? 's' : ''} downloaded and added to your collection.db. Press F5 in osu! to scan.`
            }
          </div>
        )}
      </div>

      {/* Table */}
      <div className="scroll-area" style={{ flex: 1 }}>
        <div className="card" style={{ margin: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'left' }}>Beatmapset</th>
                <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'left' }}>Title</th>
                <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'left' }}>Artist</th>
                <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-list">
              {items.map((item) => (
                <tr key={item.beatmapsetId}>
                  <td style={{ padding: '8px 16px', color: 'var(--brand-500)', fontWeight: 500 }}>
                    #{item.beatmapsetId}
                  </td>
                  <td style={{ padding: '8px 16px', color: 'var(--text-900)' }}>{item.title ?? '—'}</td>
                  <td style={{ padding: '8px 16px', color: 'var(--text-600)' }}>{item.artist ?? '—'}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                    {item.status === 'pending' && (
                      <span style={{ color: 'var(--text-400)', fontSize: 12 }}>Pending</span>
                    )}
                    {item.status === 'downloading' && (
                      <span style={{ color: 'var(--amber-600)', fontSize: 12 }}>Downloading…</span>
                    )}
                    {item.status === 'done' && (
                      <span className="badge badge-green">Done</span>
                    )}
                    {item.status === 'error' && (
                      <span className="badge badge-red" title={item.error}>Error</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
