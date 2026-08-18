/**
 * Just enough ZIP to move a folder of patches around.
 *
 * Writing uses STORE rather than DEFLATE: a bundle of patches is a few tens of kilobytes, so
 * compression buys nothing worth an async write path and a second failure mode. Reading has to
 * handle DEFLATE regardless, because a zip made by Finder, Explorer or `zip(1)` will be compressed
 * — that is the whole point of accepting zips rather than a format of our own.
 *
 * Only the parts of the spec a patch bundle can actually use are implemented: no encryption, no
 * multi-disk archives, and no ZIP64. A bundle large enough to need ZIP64 would be around 65,000
 * patches, which the reader reports rather than silently truncating.
 */

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

const METHOD_STORE = 0
const METHOD_DEFLATE = 8

/** Bit 11: names are UTF-8. Always set, since we always encode them that way. */
const FLAG_UTF8 = 0x800

export interface ZipFile {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** MS-DOS date/time, which is what a zip records. Its epoch is 1980 and seconds are halved. */
function dosStamp(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export function writeZip(files: ZipFile[], now = new Date()): Uint8Array {
  const stamp = dosStamp(now)
  const encoder = new TextEncoder()
  const records = files.map((file) => ({
    name: encoder.encode(file.name),
    data: file.data,
    crc: crc32(file.data),
  }))

  const localSize = records.reduce((n, r) => n + 30 + r.name.length + r.data.length, 0)
  const centralSize = records.reduce((n, r) => n + 46 + r.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  const offsets: number[] = []
  let at = 0

  for (const r of records) {
    offsets.push(at)
    view.setUint32(at, SIG_LOCAL, true)
    view.setUint16(at + 4, 20, true) // version needed
    view.setUint16(at + 6, FLAG_UTF8, true)
    view.setUint16(at + 8, METHOD_STORE, true)
    view.setUint16(at + 10, stamp.time, true)
    view.setUint16(at + 12, stamp.date, true)
    view.setUint32(at + 14, r.crc, true)
    view.setUint32(at + 18, r.data.length, true)
    view.setUint32(at + 22, r.data.length, true)
    view.setUint16(at + 26, r.name.length, true)
    view.setUint16(at + 28, 0, true) // extra field length
    out.set(r.name, at + 30)
    out.set(r.data, at + 30 + r.name.length)
    at += 30 + r.name.length + r.data.length
  }

  const centralStart = at
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    view.setUint32(at, SIG_CENTRAL, true)
    view.setUint16(at + 4, 20, true) // version made by
    view.setUint16(at + 6, 20, true) // version needed
    view.setUint16(at + 8, FLAG_UTF8, true)
    view.setUint16(at + 10, METHOD_STORE, true)
    view.setUint16(at + 12, stamp.time, true)
    view.setUint16(at + 14, stamp.date, true)
    view.setUint32(at + 16, r.crc, true)
    view.setUint32(at + 20, r.data.length, true)
    view.setUint32(at + 24, r.data.length, true)
    view.setUint16(at + 28, r.name.length, true)
    view.setUint16(at + 30, 0, true) // extra
    view.setUint16(at + 32, 0, true) // comment
    view.setUint16(at + 34, 0, true) // disk number
    view.setUint16(at + 36, 0, true) // internal attributes
    view.setUint32(at + 38, 0, true) // external attributes
    view.setUint32(at + 42, offsets[i], true)
    out.set(r.name, at + 46)
    at += 46 + r.name.length
  }

  view.setUint32(at, SIG_EOCD, true)
  view.setUint16(at + 4, 0, true) // this disk
  view.setUint16(at + 6, 0, true) // disk with central directory
  view.setUint16(at + 8, records.length, true)
  view.setUint16(at + 10, records.length, true)
  view.setUint32(at + 12, centralSize, true)
  view.setUint32(at + 16, centralStart, true)
  view.setUint16(at + 20, 0, true) // comment length
  return out
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read compressed zip files')
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  )
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The end-of-central-directory record lives at the very end, behind a comment of unknown length. */
function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i
  }
  return -1
}

export async function readZip(bytes: Uint8Array): Promise<ZipFile[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocd(view)
  if (eocd < 0) throw new Error('Not a zip file')

  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  if (count === 0xffff || at === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported')
  }

  const decoder = new TextDecoder()
  const files: ZipFile[] = []

  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== SIG_CENTRAL) {
      throw new Error('Damaged zip: central directory ended early')
    }
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localAt = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength

    // Directories carry no data, and the local header's own name/extra lengths are authoritative:
    // writers routinely put a different extra field in each copy of the header.
    if (name.endsWith('/')) continue
    if (view.getUint32(localAt, true) !== SIG_LOCAL) {
      throw new Error(`Damaged zip: bad header for ${name}`)
    }
    const dataAt =
      localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true)
    const raw = bytes.subarray(dataAt, dataAt + compressedSize)

    if (method === METHOD_STORE) {
      files.push({ name, data: raw.slice() })
    } else if (method === METHOD_DEFLATE) {
      files.push({ name, data: await inflateRaw(raw) })
    } else {
      throw new Error(`${name} uses an unsupported compression method (${method})`)
    }
  }

  return files
}
