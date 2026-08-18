/**
 * The zip codec.
 *
 * The reader has to cope with archives this app did not write — that is the point of accepting
 * zips at all — so the interop case is checked against a fixture produced by Info-ZIP's `zip -9`
 * rather than against our own writer. Round-tripping our output only proves we agree with
 * ourselves.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { crc32, readZip, writeZip, type ZipFile } from '../zip'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (s: string) => new TextEncoder().encode(s)
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)))

describe('crc32', () => {
  it('matches the known value for the standard check string', () => {
    // "123456789" -> 0xCBF43926 is the ISO check value for CRC-32.
    expect(crc32(text('123456789'))).toBe(0xcbf43926)
  })

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('round trip', () => {
  it('preserves names and bytes', async () => {
    const files: ZipFile[] = [
      { name: 'manifest.json', data: text('{"version":1}') },
      { name: 'Group 1.syx', data: bytes(0xf0, 0x01, 0x33, 0x02, 0x00, 0x00, 0xf7) },
    ]
    const read = await readZip(writeZip(files))
    expect(read.map((f) => f.name)).toEqual(['manifest.json', 'Group 1.syx'])
    expect(read[1].data).toEqual(files[1].data)
  })

  it('survives high bytes, which is all a .syx is', async () => {
    const data = new Uint8Array(512)
    for (let i = 0; i < data.length; i++) data[i] = (i * 7) & 0xff
    const [file] = await readZip(writeZip([{ name: 'patch.syx', data }]))
    expect(file.data).toEqual(data)
  })

  it('handles non-ASCII names', async () => {
    const [file] = await readZip(writeZip([{ name: 'Groupe Numéro 5.syx', data: text('x') }]))
    expect(file.name).toBe('Groupe Numéro 5.syx')
  })

  it('writes an empty archive that reads back as empty', async () => {
    expect(await readZip(writeZip([]))).toEqual([])
  })

  it('returns copies, not views onto the archive', async () => {
    const archive = writeZip([{ name: 'a.syx', data: text('hello') }])
    const [file] = await readZip(archive)
    archive.fill(0)
    expect(new TextDecoder().decode(file.data)).toBe('hello')
  })
})

describe('reading archives written elsewhere', () => {
  it('reads a deflated archive from Info-ZIP', async () => {
    const files = await readZip(fixture('third-party.zip'))
    expect(files.map((f) => f.name)).toEqual(['manifest.json', 'Group 1.syx', 'Group 2.syx'])
    // Two full groups of forty programs, at 159 bytes per program-data message.
    expect(files[1].data.length).toBe(40 * 159)
    expect(files[1].data[0]).toBe(0xf0)
    expect(files[1].data.at(-1)).toBe(0xf7)
    expect(JSON.parse(new TextDecoder().decode(files[0].data)).name).toBe('Fixture Bundle')
  })

  it('skips directory entries', async () => {
    // Directory members are legal and carry no data; they must not turn into empty patches.
    const withDir = writeZip([
      { name: 'patches/', data: new Uint8Array(0) },
      { name: 'patches/a.syx', data: text('x') },
    ])
    expect((await readZip(withDir)).map((f) => f.name)).toEqual(['patches/a.syx'])
  })

  it('tolerates an extra field in the local header only', async () => {
    // Writers routinely put a different extra field in each copy of the header, so the local
    // header's own lengths decide where the data starts.
    const archive = withLocalExtra(writeZip([{ name: 'a.syx', data: text('payload') }]))
    const [file] = await readZip(archive)
    expect(new TextDecoder().decode(file.data)).toBe('payload')
  })
})

describe('damaged and unsupported archives', () => {
  it('rejects something that is not a zip at all', async () => {
    await expect(readZip(text('this is a .syx file, not a zip'))).rejects.toThrow('Not a zip file')
  })

  it('rejects an unsupported compression method', async () => {
    const archive = writeZip([{ name: 'a.syx', data: text('x') }])
    const view = new DataView(archive.buffer)
    // Method lives at +8 in the local header and +10 in the central one; 14 is LZMA.
    view.setUint16(8, 14, true)
    const eocd = archive.length - 22
    const central = view.getUint32(eocd + 16, true)
    view.setUint16(central + 10, 14, true)
    await expect(readZip(archive)).rejects.toThrow('unsupported compression method')
  })

  it('reports a truncated central directory rather than returning half an archive', async () => {
    const archive = writeZip([{ name: 'a.syx', data: text('x') }])
    const view = new DataView(archive.buffer)
    view.setUint32(archive.length - 22 + 16, 3, true) // central directory offset -> nonsense
    await expect(readZip(archive)).rejects.toThrow('central directory')
  })
})

/** Rebuild an archive with a four-byte extra field added to local headers only. */
function withLocalExtra(archive: Uint8Array): Uint8Array {
  const view = new DataView(archive.buffer)
  const nameLength = view.getUint16(26, true)
  const dataStart = 30 + nameLength
  const extra = bytes(0x55, 0x54, 0x00, 0x00)
  const out = new Uint8Array(archive.length + extra.length)
  out.set(archive.subarray(0, dataStart))
  out.set(extra, dataStart)
  out.set(archive.subarray(dataStart), dataStart + extra.length)
  const outView = new DataView(out.buffer)
  outView.setUint16(28, extra.length, true)
  // Everything after the local header shifted, so the central directory's pointers follow.
  const eocd = out.length - 22
  const central = view.getUint32(archive.length - 22 + 16, true) + extra.length
  outView.setUint32(eocd + 16, central, true)
  return out
}

describe('deflate', () => {
  it('inflates a member compressed by zlib', async () => {
    const payload = text('sysex '.repeat(200))
    const archive = deflateArchive('big.syx', payload)
    const [file] = await readZip(archive)
    expect(file.data).toEqual(payload)
  })
})

/** A minimal DEFLATE archive, so the reader's compressed path is exercised independently. */
function deflateArchive(name: string, data: Uint8Array): Uint8Array {
  const compressed = new Uint8Array(deflateRawSync(data))
  const nameBytes = text(name)
  const out = new Uint8Array(30 + nameBytes.length + compressed.length + 46 + nameBytes.length + 22)
  const view = new DataView(out.buffer)
  const crc = crc32(data)

  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(8, 8, true) // deflate
  view.setUint32(14, crc, true)
  view.setUint32(18, compressed.length, true)
  view.setUint32(22, data.length, true)
  view.setUint16(26, nameBytes.length, true)
  out.set(nameBytes, 30)
  out.set(compressed, 30 + nameBytes.length)

  const central = 30 + nameBytes.length + compressed.length
  view.setUint32(central, 0x02014b50, true)
  view.setUint16(central + 10, 8, true)
  view.setUint32(central + 16, crc, true)
  view.setUint32(central + 20, compressed.length, true)
  view.setUint32(central + 24, data.length, true)
  view.setUint16(central + 28, nameBytes.length, true)
  view.setUint32(central + 42, 0, true)
  out.set(nameBytes, central + 46)

  const eocd = central + 46 + nameBytes.length
  view.setUint32(eocd, 0x06054b50, true)
  view.setUint16(eocd + 8, 1, true)
  view.setUint16(eocd + 10, 1, true)
  view.setUint32(eocd + 12, 46 + nameBytes.length, true)
  view.setUint32(eocd + 16, central, true)
  return out
}
