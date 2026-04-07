import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  ParsedCollectionDb,
  UploadSummary,
  UploadDetail,
  MissingMap,
  DownloadItem,
  IpcResponse
} from '../shared/types'

const api = {
  // ── Settings ───────────────────────────────────────────────────────────
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:get'),

  setSettings: (partial: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke('settings:set', partial),

  detectSongsFolder: (): Promise<IpcResponse<string>> =>
    ipcRenderer.invoke('settings:detectSongsFolder'),

  browseSongsFolder: (): Promise<IpcResponse<string>> =>
    ipcRenderer.invoke('settings:browseSongsFolder'),

  browseCollectionDb: (): Promise<IpcResponse<string>> =>
    ipcRenderer.invoke('settings:browseCollectionDb'),

  getInstalledIds: (songsFolder: string): Promise<IpcResponse<number[]>> =>
    ipcRenderer.invoke('settings:getInstalledIds', songsFolder),

  // ── Collection ─────────────────────────────────────────────────────────
  parseCollectionDb: (filePath: string): Promise<IpcResponse<ParsedCollectionDb>> =>
    ipcRenderer.invoke('collection:parse', filePath),

  // ── Web app ────────────────────────────────────────────────────────────
  listUploads: (): Promise<IpcResponse<UploadSummary[]>> =>
    ipcRenderer.invoke('webApp:listUploads'),

  getUpload: (id: string): Promise<IpcResponse<UploadDetail>> =>
    ipcRenderer.invoke('webApp:getUpload', id),

  getCollectionHashes: (uploadId: string, collectionId: string): Promise<IpcResponse<string[]>> =>
    ipcRenderer.invoke('webApp:getCollectionHashes', uploadId, collectionId),

  pingWebApp: (): Promise<IpcResponse<boolean>> =>
    ipcRenderer.invoke('webApp:ping'),

  // ── osu! API ───────────────────────────────────────────────────────────
  resolveHashes: (hashes: string[]): Promise<IpcResponse<MissingMap[]>> =>
    ipcRenderer.invoke('osuApi:resolveHashes', hashes),

  onResolveProgress: (cb: (progress: { completed: number; total: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { completed: number; total: number }) => cb(data)
    ipcRenderer.on('osuApi:resolveProgress', handler)
    return () => ipcRenderer.removeListener('osuApi:resolveProgress', handler)
  },

  // ── Sizes ──────────────────────────────────────────────────────────────
  fetchSizes: (beatmapsetIds: number[]): Promise<IpcResponse<Record<number, number>>> =>
    ipcRenderer.invoke('sizes:fetch', beatmapsetIds),

  onSizesProgress: (cb: (progress: { completed: number; total: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { completed: number; total: number }) => cb(data)
    ipcRenderer.on('sizes:progress', handler)
    return () => ipcRenderer.removeListener('sizes:progress', handler)
  },

  // ── Collection writer ──────────────────────────────────────────────────
  addHashesToCollection: (
    dbPath: string,
    collectionName: string,
    hashes: string[]
  ): Promise<IpcResponse<{ added: number }>> =>
    ipcRenderer.invoke('collection:addHashes', dbPath, collectionName, hashes),

  // ── Download ───────────────────────────────────────────────────────────
  startDownload: (items: DownloadItem[]): Promise<IpcResponse<{ failed: number[] }>> =>
    ipcRenderer.invoke('download:start', items),

  onDownloadProgress: (
    cb: (update: { beatmapsetId: number; status: string; error?: string }) => void
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: { beatmapsetId: number; status: string; error?: string }
    ) => cb(data)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
