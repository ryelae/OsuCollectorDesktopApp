import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { parseCollectionDb } from './collectionParser'
import type { ParsedCollection } from '../../shared/types'

// ── Encode helpers ─────────────────────────────────────────────────────────

function encodeULEB128(value: number): Buffer {
  const bytes: number[] = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value !== 0) byte |= 0x80
    bytes.push(byte)
  } while (value !== 0)
  return Buffer.from(bytes)
}

function encodeOsuString(str: string): Buffer {
  if (!str) return Buffer.from([0x00])
  const strBuf = Buffer.from(str, 'utf8')
  const lenBuf = encodeULEB128(strBuf.length)
  return Buffer.concat([Buffer.from([0x0b]), lenBuf, strBuf])
}

function encodeInt32LE(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeInt32LE(value, 0)
  return buf
}

// ── Writer ─────────────────────────────────────────────────────────────────

function writeCollectionDb(
  filePath: string,
  version: number,
  collections: ParsedCollection[]
): void {
  const parts: Buffer[] = []

  parts.push(encodeInt32LE(version))
  parts.push(encodeInt32LE(collections.length))

  for (const col of collections) {
    parts.push(encodeOsuString(col.name))
    parts.push(encodeInt32LE(col.beatmapHashes.length))
    for (const hash of col.beatmapHashes) {
      parts.push(encodeOsuString(hash))
    }
  }

  writeFileSync(filePath, Buffer.concat(parts))
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Add hashes to a collection in the given collection.db file.
 * - If a collection with `collectionName` already exists, merges hashes in (deduped).
 * - If it doesn't exist, appends a new collection.
 * Makes a .bak backup before writing.
 * Returns the number of new hashes actually added.
 */
export function addHashesToCollection(
  dbPath: string,
  collectionName: string,
  newHashes: string[]
): number {
  // Backup first
  copyFileSync(dbPath, dbPath + '.bak')

  const parsed = parseCollectionDb(dbPath)

  const existing = parsed.collections.find((c) => c.name === collectionName)

  let added = 0

  if (existing) {
    const existingSet = new Set(existing.beatmapHashes)
    const toAdd = newHashes.filter((h) => !existingSet.has(h))
    added = toAdd.length
    existing.beatmapHashes = [...existing.beatmapHashes, ...toAdd]
  } else {
    parsed.collections.push({ name: collectionName, beatmapHashes: newHashes })
    added = newHashes.length
  }

  writeCollectionDb(dbPath, parsed.version, parsed.collections)
  return added
}
