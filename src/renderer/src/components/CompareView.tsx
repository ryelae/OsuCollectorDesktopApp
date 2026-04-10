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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [collectionsByUpload, setCollectionsByUpload] = useState<Record<string, RemoteCollection[]>>({})
  const [loadingUploads, setLoadingUploads] = useState<Set<string>>(new Set())

  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<RemoteCollection | null>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [maps, setMaps] = useState<MissingMap[]>([])
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set())
  const [sizes, setSizes] = useState<Record<number, number>>({})
  const [sizesLoading, setSizesLoading] = useState(false)
  const [resolveProgress, setResolveProgress] = useState<{ completed: number; total: number } | null>(null)
  const [resolveError, setResolveError] = useState('')
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([])
  const [generalError, setGeneralError] = useState('')
  const [addedToDb, setAddedToDb] = useState(false)

  const unsubResolve = useRef<(() => void) | null>(null)
  const unsubDownload = useRef<(() => void) | null>(null)
  const unsubSizes = useRef<(() => void) | null>(null)

  useEffect(() => () => { unsubResolve.current?.(); unsubDownload.current?.(); unsubSizes.current?.() }, [])

  useEffect(() => { loadUploads() }, [])

  useEffect(() => {
    const onFocus = () => { if (maps.length > 0) refreshInstalled() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [maps])

  async function fetchCollectionsForUploads(toLoad: UploadSummary[]) {
    const ids = toLoad.map((u) => u.id)
    setLoadingUploads((prev) => new Set([...prev, ...ids]))
    await Promise.all(toLoad.map(async (u) => {
      const res = await window.api.getUpload(u.id)
      if (res.ok) {
        setCollectionsByUpload((prev) => ({ ...prev, [u.id]: res.data.collections }))
      }
      setLoadingUploads((prev) => { const n = new Set(prev); n.delete(u.id); return n })
    }))
  }

  async function loadUploads() {
    setUploadsLoading(true)
    setUploadsError('')
    const res = await window.api.listUploads()
    setUploadsLoading(false)
    if (!res.ok) { setUploadsError(res.error); return }
    setUploads(res.data)
    setExpandedGroups(new Set(res.data.map((u) => u.uploaderName)))
    setCollectionsByUpload({})
    fetchCollectionsForUploads(res.data)
  }

  function toggleGroup(name: string, groupUploads: UploadSummary[]) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
        const unloaded = groupUploads.filter((u) => !collectionsByUpload[u.id] && !loadingUploads.has(u.id))
        if (unloaded.length > 0) fetchCollectionsForUploads(unloaded)
      }
      return next
    })
  }

  async function selectCollection(uploadId: string, col: RemoteCollection) {
    setSelectedUploadId(uploadId)
    setSelectedCollection(col)
    setGeneralError('')
    setResolveError('')
    setMaps([])
    setSizes({})
    setSizesLoading(false)
    setStage('idle')
    setAddedToDb(false)

    const hashRes = await window.api.getCollectionHashes(uploadId, col.id)
    if (!hashRes.ok) { setGeneralError(hashRes.error); return }

    const initial = hashRes.data.map((hash) => ({ hash, beatmapsetId: null as number | null }))
    setMaps(initial)
    await resolveAll(hashRes.data)
  }

  async function refreshInstalled() {
    const settings = await window.api.getSettings()
    if (!settings.songsFolder) return
    const res = await window.api.getInstalledIds(settings.songsFolder)
    console.log('refreshInstalled:', settings.songsFolder, res)
    if (res.ok) setInstalledIds(new Set(res.data))
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

    const settings = await window.api.getSettings()
    if (settings.songsFolder) {
      const installedRes = await window.api.getInstalledIds(settings.songsFolder)
      if (installedRes.ok) setInstalledIds(new Set(installedRes.data))
    }

    setStage('idle')

    const uniqueIds = [...new Set(res.data.filter(m => m.beatmapsetId !== null).map(m => m.beatmapsetId!))]
    if (uniqueIds.length > 0) {
      setSizes({})
      setSizesLoading(true)
      unsubSizes.current?.()
      unsubSizes.current = window.api.onSizesProgress(() => {})
      const sizesRes = await window.api.fetchSizes(uniqueIds)
      unsubSizes.current?.()
      unsubSizes.current = null
      if (sizesRes.ok) setSizes(sizesRes.data)
      setSizesLoading(false)
    }
  }

  async function startDownload() {
    if (!selectedCollection || !selectedUploadId) return

    const settings = await window.api.getSettings()

    const bySet = new Map<number, DownloadItem>()
    for (const m of maps) {
      if (m.beatmapsetId === null) continue
      if (installedIds.has(m.beatmapsetId)) continue
      if (!bySet.has(m.beatmapsetId)) {
        bySet.set(m.beatmapsetId, { beatmapsetId: m.beatmapsetId, title: m.title, artist: m.artist, hashes: [], status: 'pending' })
      }
      bySet.get(m.beatmapsetId)!.hashes.push(m.hash)
    }
    const items = Array.from(bySet.values())

    const allHashes = maps.filter((m) => m.beatmapsetId !== null).map((m) => m.hash)
    const dbPath = settings.songsFolder
      ? settings.songsFolder.replace(/[/\\]Songs[/\\]?$/, '') + '\\collection.db'
      : null

    if (!items.length) {
      if (dbPath && allHashes.length > 0) {
        const writeRes = await window.api.addHashesToCollection(dbPath, selectedCollection.name, allHashes)
        if (!writeRes.ok) setGeneralError(`Failed to update collection.db: ${writeRes.error}`)
        else setAddedToDb(true)
      }
      await refreshInstalled()
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

    if (dbPath && allHashes.length > 0) {
      const writeRes = await window.api.addHashesToCollection(dbPath, selectedCollection.name, allHashes)
      if (!writeRes.ok) setGeneralError(`Downloaded OK but failed to update collection.db: ${writeRes.error}`)
      else setAddedToDb(true)
    } else if (!dbPath) {
      setGeneralError('Downloaded OK but Songs folder not configured — collection.db not updated')
    }

    await refreshInstalled()
  }

  if (stage === 'download') {
    return <DownloadProgress items={downloadItems} onBack={async () => { setStage('idle'); await refreshInstalled() }} />
  }

  const resolved = maps.filter((m) => m.beatmapsetId !== null)
  const unresolved = maps.filter((m) => m.beatmapsetId === null)
  const notInstalled = resolved.filter((m) => !installedIds.has(m.beatmapsetId!))
  const uniqueToDownload = new Set(notInstalled.map((m) => m.beatmapsetId)).size
  const uniqueToDownloadIds = new Set(notInstalled.map((m) => m.beatmapsetId!))
  const totalBytes = [...uniqueToDownloadIds].reduce((acc, id) => acc + (sizes[id] ?? 0), 0)

  function formatBytes(bytes: number): string {
    if (bytes === 0) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Group uploads by uploader name
  const grouped = uploads.reduce((map, u) => {
    if (!map.has(u.uploaderName)) map.set(u.uploaderName, [])
    map.get(u.uploaderName)!.push(u)
    return map
  }, new Map<string, UploadSummary[]>())

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel */}
      <aside style={{
        width: 240, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
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
            {[...grouped.entries()].map(([name, groupUploads]) => {
              const isOpen = expandedGroups.has(name)
              const totalMaps = groupUploads.reduce((a, u) => a + u.totalMaps, 0)
              const totalCollections = groupUploads.reduce((a, u) => a + u.collectionCount, 0)
              const isLoading = groupUploads.some((u) => loadingUploads.has(u.id))
              const allCollections = groupUploads.flatMap((u) =>
                (collectionsByUpload[u.id] ?? []).map((col) => ({ col, uploadId: u.id }))
              )

              return (
                <div key={name}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(name, groupUploads)}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      padding: '10px 12px', background: 'transparent', border: 'none',
                      borderRadius: 0, textAlign: 'left', cursor: 'pointer', gap: 8,
                      transition: 'background 150ms'
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms', color: 'var(--text-400)', flexShrink: 0 }}>
                      <ChevronIcon />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-900)' }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-500)', marginTop: 1 }}>
                        {totalCollections} collections · {totalMaps.toLocaleString()} maps
                      </div>
                    </div>
                  </button>

                  {/* Collections directly under group */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--divider)' }}>
                      {isLoading && (
                        <p style={{ padding: '8px 12px 8px 32px', color: 'var(--text-400)', fontSize: 12 }}>Loading…</p>
                      )}
                      {allCollections.map(({ col, uploadId }) => {
                        const active = selectedCollection?.id === col.id
                        return (
                          <button
                            key={col.id}
                            onClick={() => selectCollection(uploadId, col)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              width: '100%', padding: '8px 12px 8px 40px',
                              background: active ? 'var(--brand-50)' : 'transparent',
                              border: 'none', borderRadius: 0, textAlign: 'left',
                              cursor: 'pointer', transition: 'background 150ms', gap: 8
                            }}
                            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
                            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = active ? 'var(--brand-50)' : 'transparent' }}
                          >
                            <div style={{ fontSize: 13, color: active ? 'var(--brand-700)' : 'var(--text-700)', fontWeight: active ? 500 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {col.name || <em style={{ color: 'var(--text-400)' }}>Unnamed</em>}
                            </div>
                            <div style={{ fontSize: 11, color: active ? 'var(--brand-500)' : 'var(--text-400)', flexShrink: 0 }}>
                              {col.mapCount.toLocaleString()}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
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
                <button onClick={onGoToSettings} style={{ marginLeft: 12, fontSize: 12, color: 'var(--red-600)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
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
                    {unresolved.length > 0 && <span className="badge badge-red">{unresolved.length} unresolved</span>}
                  </>
                )}
                {resolveError && (
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => resolveAll(maps.map(m => m.hash))}>
                    Retry resolve
                  </button>
                )}
                {stage === 'idle' && maps.length > 0 && (
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={refreshInstalled} title="Re-scan Songs folder for newly installed maps">
                    Refresh
                  </button>
                )}
                {stage === 'idle' && uniqueToDownload > 0 && (
                  <button className="btn-primary" onClick={startDownload} style={{ flexDirection: 'column', gap: 1, lineHeight: 1.3 }}>
                    <span>Download &amp; Import {uniqueToDownload} beatmapset{uniqueToDownload !== 1 ? 's' : ''}</span>
                    {(totalBytes > 0 || sizesLoading) && (
                      <span style={{ fontSize: 11, opacity: 0.85 }}>
                        {totalBytes > 0 ? formatBytes(totalBytes) : 'calculating size…'}
                      </span>
                    )}
                  </button>
                )}
                {stage === 'idle' && resolved.length > 0 && uniqueToDownload === 0 && (
                  <button className="btn-secondary" onClick={startDownload} disabled={addedToDb} style={{ fontSize: 13 }}>
                    {addedToDb ? 'Added!' : 'Add to collection.db'}
                  </button>
                )}
              </div>

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
                        <th style={{ padding: '8px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-500)', textAlign: 'right' }}>Size</th>
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
                                : stage === 'resolve'
                                  ? <span style={{ color: 'var(--text-400)', fontSize: 12 }}>resolving…</span>
                                  : <span style={{ color: 'var(--text-400)', fontSize: 12 }}>not found</span>
                              }
                            </td>
                            <td style={{ padding: '8px 16px', color: 'var(--text-900)' }}>{m.title ?? '—'}</td>
                            <td style={{ padding: '8px 16px', color: 'var(--text-600)' }}>{m.artist ?? '—'}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text-500)', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {m.beatmapsetId !== null && sizes[m.beatmapsetId]
                                ? formatBytes(sizes[m.beatmapsetId])
                                : sizesLoading && m.beatmapsetId !== null && !owned
                                  ? <span style={{ color: 'var(--text-400)' }}>…</span>
                                  : ''}
                            </td>
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
