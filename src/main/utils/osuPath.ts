import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Try to find the osu! stable installation folder.
 * Priority:
 *   1. Windows registry  HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\osu!
 *   2. %LOCALAPPDATA%\osu!
 *   3. Returns null — caller should ask the user to pick manually
 */
export async function detectOsuSongsFolder(): Promise<string | null> {
  // Try registry first (Windows only)
  if (process.platform === 'win32') {
    const fromReg = await tryRegistry()
    if (fromReg) return fromReg
  }

  // Fallback: %LOCALAPPDATA%\osu!\Songs
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const candidate = join(localAppData, 'osu!', 'Songs')
    if (existsSync(candidate)) return candidate
    // Also check one level up in case osu! exists but Songs is not created yet
    const osuRoot = join(localAppData, 'osu!')
    if (existsSync(osuRoot)) return join(osuRoot, 'Songs')
  }

  return null
}

async function tryRegistry(): Promise<string | null> {
  try {
    // dynamic import so this file doesn't crash on non-Windows builds
    const WinReg = (await import('winreg')).default
    return await new Promise<string | null>((resolve) => {
      const reg = new WinReg({
        hive: WinReg.HKCU,
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\osu!'
      })
      reg.get('InstallLocation', (err, item) => {
        if (err || !item) {
          resolve(null)
          return
        }
        const installDir = item.value
        const songsDir = join(installDir, 'Songs')
        resolve(existsSync(songsDir) ? songsDir : installDir)
      })
    })
  } catch {
    return null
  }
}

/** Find collection.db next to osu!.exe given a Songs folder path */
export function collectionDbFromSongsFolder(songsFolder: string): string | null {
  // Songs is typically <osuRoot>/Songs — db is at <osuRoot>/collection.db
  const osuRoot = join(songsFolder, '..')
  const candidate = join(osuRoot, 'collection.db')
  return existsSync(candidate) ? candidate : null
}

/** Quick sanity-check that a folder can receive .osz downloads */
export function isSongsFolderWritable(folder: string): boolean {
  try {
    readdirSync(folder)
    return true
  } catch {
    return false
  }
}

/**
 * Returns the set of beatmapset IDs already present in the Songs folder.
 * osu! names beatmap folders like: "1234567 Artist - Title"
 * So we just check whether any entry starts with "{id} " or "{id}_".
 */
export function getInstalledBeatmapsetIds(songsFolder: string): Set<number> {
  const installed = new Set<number>()
  try {
    const entries = readdirSync(songsFolder, { withFileTypes: true })
    for (const entry of entries) {
      // Extracted folder: "1234567 Artist - Title"
      if (entry.isDirectory()) {
        const match = entry.name.match(/^(\d+)[\s_]/)
        if (match) installed.add(parseInt(match[1], 10))
      }
      // Unimported .osz still sitting in Songs folder: "1234567.osz"
      if (entry.isFile() && entry.name.endsWith('.osz')) {
        const match = entry.name.match(/^(\d+)\.osz$/)
        if (match) installed.add(parseInt(match[1], 10))
      }
    }
  } catch (err) {
    console.error('getInstalledBeatmapsetIds: failed to read folder', songsFolder, err)
  }
  return installed
}
