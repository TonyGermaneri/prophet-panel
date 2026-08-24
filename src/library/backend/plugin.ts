/**
 * The patch library in the plugin, kept as one document on disk.
 *
 * A row store would be the obvious mirror of IndexedDB, but the whole library is around 50 KB —
 * 400 factory programs at 133 bytes each — so reading and writing it whole is simpler than a
 * schema, and keeps the shape of a patch defined in one language rather than two.
 */

import { call, fromBase64, toBase64 } from '../../platform/plugin/bridge'
import type { LibraryEntry } from '../entry'
import type { LibraryBackend } from './types'

/** The on-disk shape: an entry with its payload base64'd, since the document is JSON. */
interface StoredEntry extends Omit<LibraryEntry, 'payload'> {
  payload: string
}

interface LibraryDocument {
  entries: StoredEntry[]
  meta: Record<string, unknown>
}

function toStored(entry: LibraryEntry): StoredEntry {
  return { ...entry, payload: toBase64(entry.payload) }
}

function fromStored(entry: StoredEntry): LibraryEntry {
  return { ...entry, payload: fromBase64(entry.payload) }
}

let loading: Promise<LibraryDocument> | null = null
// Node's setTimeout and the DOM's return different handle types; this is whichever is real.
let pendingSave: ReturnType<typeof setTimeout> | null = null

async function load(): Promise<LibraryDocument> {
  const raw = (await call('libLoad')) as string

  if (!raw) return { entries: [], meta: {} }

  try {
    const parsed = JSON.parse(raw) as Partial<LibraryDocument>
    return { entries: parsed.entries ?? [], meta: parsed.meta ?? {} }
  } catch {
    // A corrupt document is not worth refusing to start over. Seeding refills the factory set,
    // and anything else was already unreadable.
    return { entries: [], meta: {} }
  }
}

function doc(): Promise<LibraryDocument> {
  loading ??= load()
  return loading
}

function save(current: LibraryDocument): void {
  // Coalesced: seeding writes 400 rows in one batch, and saving per row would rewrite the whole
  // document 400 times over.
  if (pendingSave !== null) clearTimeout(pendingSave)

  pendingSave = setTimeout(() => {
    pendingSave = null
    void call('libSave', JSON.stringify(current))
  }, 50)
}

export const backend: LibraryBackend = {
  async all() {
    return (await doc()).entries.map(fromStored)
  },

  async put(entries) {
    const current = await doc()
    const positions = new Map(current.entries.map((entry, index) => [entry.id, index]))

    for (const entry of entries) {
      const at = positions.get(entry.id)

      if (at === undefined) {
        positions.set(entry.id, current.entries.length)
        current.entries.push(toStored(entry))
      } else {
        current.entries[at] = toStored(entry)
      }
    }

    save(current)
  },

  async remove(ids) {
    const current = await doc()
    const dropping = new Set(ids)
    current.entries = current.entries.filter((entry) => !dropping.has(entry.id))
    save(current)
  },

  async removeBySource(source) {
    const current = await doc()
    current.entries = current.entries.filter((entry) => entry.source !== source)
    save(current)
  },

  async count() {
    return (await doc()).entries.length
  },

  async getMeta<T>(key: string) {
    return (await doc()).meta[key] as T | undefined
  },

  async setMeta(key, value) {
    const current = await doc()
    current.meta[key] = value
    save(current)
  },
}
