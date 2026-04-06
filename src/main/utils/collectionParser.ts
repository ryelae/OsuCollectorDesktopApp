import { readFileSync } from 'fs'
import type { ParsedCollectionDb, ParsedCollection } from '../../shared/types'

class BufferReader {
  private pos = 0
  constructor(private buf: Buffer) {}

  readByte(): number {
    return this.buf.readUInt8(this.pos++)
  }

  readInt32(): number {
    const v = this.buf.readInt32LE(this.pos)
    this.pos += 4
    return v
  }

  /** ULEB128 — variable-length unsigned int used by osu! */
  readULEB128(): number {
    let result = 0
    let shift = 0
    while (true) {
      const byte = this.readByte()
      result |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
    }
    return result
  }

  readOsuString(): string {
    const marker = this.readByte()
    if (marker === 0x00) return ''
    if (marker !== 0x0b) throw new Error(`Unexpected OsuString marker 0x${marker.toString(16)} at pos ${this.pos - 1}`)
    const len = this.readULEB128()
    const str = this.buf.toString('utf8', this.pos, this.pos + len)
    this.pos += len
    return str
  }
}

export function parseCollectionDb(filePath: string): ParsedCollectionDb {
  const buf = readFileSync(filePath)
  const reader = new BufferReader(buf)

  const version = reader.readInt32()
  if (version < 20000000 || version > 99999999) {
    throw new Error(`Unexpected collection.db version: ${version}`)
  }

  const collectionCount = reader.readInt32()
  const collections: ParsedCollection[] = []

  for (let i = 0; i < collectionCount; i++) {
    const name = reader.readOsuString()
    const mapCount = reader.readInt32()
    const beatmapHashes: string[] = []
    for (let j = 0; j < mapCount; j++) {
      beatmapHashes.push(reader.readOsuString())
    }
    collections.push({ name, beatmapHashes })
  }

  return { version, collections }
}
