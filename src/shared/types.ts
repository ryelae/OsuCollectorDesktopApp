// ── Collection.db ──────────────────────────────────────────────────────────
export interface ParsedCollection {
  name: string
  beatmapHashes: string[]
}

export interface ParsedCollectionDb {
  version: number
  collections: ParsedCollection[]
}

// ── Web app API ────────────────────────────────────────────────────────────
export interface UploadSummary {
  id: string
  uploaderName: string
  originalFilename: string
  createdAt: number          // Unix ms timestamp
  filePath: string
  parserVersion: number
  appVersion: string
  collectionCount: number
  totalMaps: number
}

export interface RemoteCollection {
  id: string
  uploadId: string
  name: string
  mapCount: number
  position: number
}

export interface UploadDetail {
  upload: UploadSummary
  collections: RemoteCollection[]
}

// ── Compare result ─────────────────────────────────────────────────────────
export interface MissingMap {
  hash: string
  beatmapsetId: number | null   // null = not yet resolved / failed
  title?: string
  artist?: string
}

export interface CompareResult {
  remoteCollectionId: number
  remoteCollectionName: string
  totalRemote: number
  missingCount: number
  missing: MissingMap[]
}

// ── Download ───────────────────────────────────────────────────────────────
export type DownloadStatus = 'pending' | 'downloading' | 'done' | 'error'

export interface DownloadItem {
  beatmapsetId: number
  title?: string
  artist?: string
  hashes: string[]
  status: DownloadStatus
  error?: string
}

// ── Settings ───────────────────────────────────────────────────────────────
export interface AppSettings {
  webAppUrl: string
  webAppPassword: string
  osuApiKey: string
  songsFolder: string
}

// ── IPC channel payloads ───────────────────────────────────────────────────
export interface IpcResult<T> {
  ok: true
  data: T
}
export interface IpcError {
  ok: false
  error: string
}
export type IpcResponse<T> = IpcResult<T> | IpcError
