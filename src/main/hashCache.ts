import Store from 'electron-store'

interface CachedEntry {
  beatmapsetId: number
  title: string
  artist: string
}

// Separate store file so it doesn't bloat settings.json
const cache = new Store<Record<string, CachedEntry>>({
  name: 'hash-cache',
  defaults: {}
})

export function getCached(hash: string): CachedEntry | undefined {
  return cache.get(hash) as CachedEntry | undefined
}

export function setCached(hash: string, entry: CachedEntry): void {
  cache.set(hash, entry)
}

export function getCacheSize(): number {
  return Object.keys(cache.store).length
}
