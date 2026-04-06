import { useEffect, useRef, useState } from 'react'
import type { UploadSummary, RemoteCollection, MissingMap, DownloadItem } from '../../../shared/types'
import DownloadProgress from './DownloadProgress'

interface Props {
  onGoToSettings: () => void
}

type Stage = 'idle' | 'resolve' | 'download'

const ChevronIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

export default function CompareView({ onGoToSettings }: Props): JSX.Element {
  const [uploads, setUploads] = useState<UploadSummary[]>([])
  const [uploadsLoading, setUploadsLoading] = useState(false)
  const [uploadsError, setUploadsError] = useState('')
  const [selectedUpload, setSelectedUpload] = useState<UploadSummary | null>(null)

  const [remoteCollections, setRemoteCollections] = useState<RemoteCollection[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<RemoteCollection | null>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [maps, setMaps] = useState<MissingMap[]>([])
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set())
  const [resolveProgress, setResolveProgress] = useState<{ completed: number; total: number } | null>(null)
  const [resolveError, setResolveError] = useState('')
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([])
  const [generalError, setGeneralError] = useState('')

  const unsubResolve = useRef<(() => void) | null>(null)
  const unsubDownload = useRef<(() => void) | null>(null)

  useEffect(() => () => { unsubResolve.current?.(); unsubDownload.current?.() }, [])

  async function loadUploads() {
    setUploadsLoading(true)
    setUploadsError('')
    const res = await window.api.listUploads()
    setUploadsLoading(false)
    if (!res.ok) { setUploadsError(res.error); return }
    setUploads(res.data)
  }

  async function selectUpload(upload: UploadSummary) {
    if (selectedUpload?.id === upload.id) {
      setSelectedUpload(null)
      setRemoteCollections([])
      setSelectedCollection(null)
      setMaps([])
      return
    }
    setSelectedUpload(upload)
    setSelectedCollection(null)
    setMaps([])
    setStage('idle')
    setCollectionsLoading(true)
    const res = await window.api.getUpload(upload.id)
    setCollectionsLoading(false)
    if (!res.ok) { setGeneralError(res.error); return }
    setRemoteCollections(res.data.collections)
  }

  async function selectCollection(col: RemoteCollection) {
    if (!selectedUpload) return
    setSelectedCollection(col)
    setGeneralError('')
    setResolveError('')
    setMaps([])
    setStage('idle')

    const hashRes = await window.api.getCollectionHashes(selectedUpload.id, col.id)
    if (!hashRes.ok) { setGeneralError(hashRes.error); return }

    const initial = hashRes.data.map((hash) => ({ hash, beatmapsetId: null as number | null }))
    setMaps(initial)
    await resolveAll(hashRes.data)
  }

  async function resolveAll(hashes: string[]) {
    setStage('resolve')
    setResolveError('')
    setResolveProgress({ completed: 0, total: hashes.length })

    unsubResolve.current?.()
    unsubResolve.current = window.api.onResolveProgress((p) => setResolveProgress(p))

    const res = await window.api.resolveHashes(hashes)
    unsubResolve.current?.()
    unsubResolve.current = null

    if (!res.ok) { setResolveError(res.error); setStage('idle'); return }
    setMaps(res.data)

    // Check which beatmapsets are already installed
    const settings = await window.api.getSettings()
    if (settings.songsFolder) {
      const installedRes = await window.api.getInstalledIds(settings.songsFolder)
      if (installedRes.ok) setInstalledIds(new Set(installedRes.data))
    }

    setStage('idle')
  }

  async function startDownload() {
    if (!selectedCollection) return

    const settings = await window.api.getSettings()

    const bySet = new Map<number, DownloadItem>()
    for (const m of maps) {
      if (m.beatmapsetId === null) continue
      if (installedIds.has(m.beatmapsetId)) continue   // already installed
      if (!bySet.has(m.beatmapsetId)) {
        bySet.set(m.beatmapsetId, { beatmapsetId: m.beatmapsetId, title: m.title, artist: m.artist, hashes: [], status: 'pending' })
      }
      bySet.get(m.beatmapsetId)!.hashes.push(m.hash)
    }
    const items = Array.from(bySet.values())

    // All already installed — skip download, just write to collection.db
    if (!items.length) {
      const allHashes = maps.filter((m) => m.beatmapsetId !== null).map((m) => m.hash)
      const dbPath = settings.songsFolder
        ? settings.songsFolder.replace(/[/\\]Songs[/\\]?$/, '') + '\\collection.db'
        : null
      if (dbPath && allHashes.length > 0) {
        const writeRes = await window.api.addHashesToCollection(dbPath, selectedCollection.name, allHashes)
        if (!writeRes.ok) setGeneralError(`Failed to update collection.db: ${writeRes.error}`)
      }
      return
    }

    setDownloadItems(items)
    setStage('download')

    const downloadedHashes: string[] = []
    unsubDownload.current?.()
    unsubDownload.current = window.api.onDownloadProgress(({ beatmapsetId, status, error }) => {
      if (status === 'done') {
        const item = items.find((i) => i.beatmapsetId === beatmapsetId)
        if (item) downloadedHashes.push(...item.hashes)
      }
      setDownloadItems((prev) =>
        prev.map((item) =>
          item.beatmapsetId === beatmapsetId
            ? { ...item, status: status as DownloadItem['status'], error }
            : item
        )
      )
    })

    await window.api.startDownload(items)
    unsubDownload.current?.()
    unsubDownload.current = null

    // Write ALL resolved hashes to collection.db — not just downloaded ones.
    // Already-installed maps should still appear in the collection.
    const allHashes = maps
      .filter((m) => m.beatmapsetId !== null)
      .map((m) => m.hash)

    const dbPath = settings.songsFolder
      ? settings.songsFolder.replace(/[/\\]Songs[/\\]?$/, '') + '\\collection.db'
      : null
    if (dbPath && allHashes.length > 0) {
      const writeRes = await window.api.addHashesToCollection(dbPath, selectedCollection.name, allHashes)
      if (!writeRes.ok) setGeneralError(`Downloaded OK but failed to update collection.db: ${writeRes.error}`)
    } else if (!dbPath) {
      setGeneralError('Downloaded OK but Songs folder not configured — collection.db not updated')
    }
  }

  if (stage === 'download') {
    return <DownloadProgress items={downloadItems} onBack={() => setStage('idle')} />
  }

  const resolved = maps.filter((m) => m.beatmapsetId !== null)
  const unresolved = maps.filter((m) => m.beatmapsetId === null)
  const notInstalled = resolved.filter((m) => !installedIds.has(m.beatmapsetId!))
  const uniqueToDownload = new Set(notInstalled.map((m) => m.beatmapsetId)).size

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '12px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
          <button
            className="btn-secondary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
            onClick={loadUploads}
            disabled={uploadsLoading}
          >
            {uploadsLoading ? 'Loading…' : uploads.length ? 'Refresh Uploads' : 'Load Uploads'}
          </button>
          {uploadsError && <p className="alert-error" style={{ marginTop: 8, fontSize: 12 }}>{uploadsError}</p>}
        </div>

        <div className="scroll-area" style={{ flex: 1 }}>
          {uploads.length === 0 && !uploadsLoading && (
            <p style={{ padding: '16px 12px', color: 'var(--text-500)', fontSize: 13, lineHeight: 1.5 }}>
              Configure connection in Settings, then load uploads.
            </p>
          )}

          <div className="divide-list">
            {uploads.map((u) => (
              <div key={u.id}>
                {/* Upload row */}
                <button
                  onClick={() => selectUpload(u)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    gap: 8,
                    transition: 'background 150ms'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <span style={{
                    display: 'inline-block',
                    transform: selectedUpload?.id === u.id ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms',
                    color: 'var(--text-400)',
                    flexShrink: 0
                  }}>
                    <ChevronIcon />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-900)' }}>{u.uploaderName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-500)', marginTop: 1 }}>
                      {u.collectionCount} collections · {u.totalMaps.toLocaleString()} maps
                    </div>
                  </div>
                </button>

                {/* Collections sub-list */}
                {selectedUpload?.id === u.id && (
                  <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)' }}>
                    {collectionsLoading && (
                      <p style={{ padding: '8px 16px', color: 'var(--text-500)', fontSize: 12 }}>Loading…</p>
                    )}
                    <div className="divide-list">
                      {remoteCollections.map((col) => {
                        const active = selectedCollection?.id === col.id
                        return (
                          <button
                            key={col.id}
                            onClick={() => selectCollection(col)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '8px 16px 8px 32px',
                              background: active ? 'var(--brand-50)' : 'transparent',
                              border: 'none',
                              borderRadius: 0,
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'background 150ms'
                            }}
                            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
                            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                          >
                            <div style={{ fontSize: 13, color: active ? 'var(--brand-700)' : 'var(--text-700)', fontWeight: active ? 500 : 400 }}>
                              {col.name || <em style={{ color: 'var(--text-400)' }}>Unnamed</em>}
                            </div>
                            <div style={{ fontSize: 11, color: active ? 'var(--brand-500)' : 'var(--text-400)', marginTop: 1 }}>
                              {col.mapCount.toLocaleString()} maps
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Right panel */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {generalError && (
          <div style={{ padding: '10px 24px', flexShrink: 0 }}>
            <div className="alert-error">
              {generalError}
              {generalError.includes('Songs folder') && (
                <button
                  onClick={onGoToSettings}
                  style={{ marginLeft: 12, fontSize: 12, color: 'var(--red-600)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Open Settings
                </button>
              )}
            </div>
          </div>
        )}

        {!selectedCollection ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⭕</div>
              <p style={{ color: 'var(--text-500)', fontSize: 14 }}>Select a collection to import it</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header card */}
            <div style={{ padding: '16px 24px', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-900)', flex: 1 }}>
                  {selectedCollection.name}
                </h2>
                {stage === 'resolve' && resolveProgress && (
                  <span className="badge badge-amber">
                    Resolving {resolveProgress.completed}/{resolveProgress.total}…
                  </span>
                )}
                {stage === 'idle' && maps.length > 0 && (
                  <>
                    <span className="badge badge-slate">{resolved.length} resolved</span>
                    {unresolved.length > 0 && (
                      <span className="badge badge-red">{unresolved.length} unresolved</span>
                    )}
                  </>
                )}
                {resolveError && (
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => resolveAll(maps.map(m => m.hash))}>
                    Retry resolve
                  </button>
                )}
                {stage === 'idle' && uniqueToDownload > 0 && (
                  <button className="btn-primary" onClick={startDownload}>
                    Download &amp; Import {uniqueToDownload} beatmapset{uniqueToDownload !== 1 ? 's' : ''}
                  </button>
                )}
                {stage === 'idle' && resolved.length > 0 && uniqueToDownload === 0 && (
                  <button className="btn-secondary" onClick={startDownload} style={{ fontSize: 13 }}>
                    Add to collection.db
                  </button>
                )}
              </div>

              {/* Resolve progress bar */}
              {stage === 'resolve' && resolveProgress && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-500)', marginBottom: 4 }}>
                    <span>Resolving hashes via osu! API…</span>
                    <span>{resolveProgress.completed} / {resolveProgress.total}</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${(resolveProgress.completed / resolveProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {resolveError && (
                <div className="alert-error" style={{ marginTop: 10, fontSize: 13 }}>
                  {resolveError}
                  {resolveError.includes('API key') && (
                    <button onClick={onGoToSettings} style={{ marginLeft: 8, fontSize: 12, color: 'var(--red-600)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                      Open Settings
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Maps table */}
            <div className="scroll-area" style={{ flex: 1 }}>
              {maps.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <p style={{ color: 'var(--text-500)' }}>Loading maps…</p>
                </div>
              ) : (
                <div className="card" style={{ margin: 16, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                        <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'left' }}>Beatmapset</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'left' }}>Title</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'left' }}>Artist</th>
                        <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody className="divide-list">
                      {maps.map((m, i) => {
                        const owned = m.beatmapsetId !== null && installedIds.has(m.beatmapsetId)
                        return (
                          <tr key={i} style={{ opacity: owned ? 0.4 : 1 }}>
                            <td style={{ padding: '8px 16px', color: 'var(--brand-500)', fontWeight: 500 }}>
                              {m.beatmapsetId !== null
                                ? `#${m.beatmapsetId}`
                                : <span style={{ color: 'var(--text-400)', fontSize: 12 }}>resolving…</span>
                              }
                            </td>
                            <td style={{ padding: '8px 16px', color: 'var(--text-900)' }}>{m.title ?? '—'}</td>
                            <td style={{ padding: '8px 16px', color: 'var(--text-600)' }}>{m.artist ?? '—'}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                              {owned && <span className="badge badge-green">Installed</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
