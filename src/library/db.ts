/**
 * The patch library, kept in IndexedDB so it survives reloads and works with no backend.
 *
 * Entries store the raw 133-byte payload rather than a decoded parameter struct, so anything the
 * app does not yet understand still round-trips out to a .syx file unchanged.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { type Patch, patchFromPayload } from '../domain/patch'

export type PatchSource = 'factory' | 'user' | 'device' | 'import'

export interface LibraryEntry {
  id: string
  name: string
  group: number
  program: number
  payload: Uint8Array
  source: PatchSource
  /** Grouping label shown in the browser, e.g. "Factory Set 1" or "From Prophet-10". */
  bank: string
  updatedAt: number
}

interface LibrarySchema extends DBSchema {
  patches: {
    key: string
    value: LibraryEntry
    indexes: { 'by-bank': string; 'by-name': string; 'by-source': PatchSource }
  }
  meta: {
    key: string
    value: unknown
  }
}

const DB_NAME = 'prophet-panel'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<LibrarySchema>> | null = null

export function db(): Promise<IDBPDatabase<LibrarySchema>> {
  dbPromise ??= openDB<LibrarySchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const patches = database.createObjectStore('patches', { keyPath: 'id' })
      patches.createIndex('by-bank', 'bank')
      patches.createIndex('by-name', 'name')
      patches.createIndex('by-source', 'source')
      database.createObjectStore('meta')
    },
  })
  return dbPromise
}

function newId(): string {
  return crypto.randomUUID()
}

export function entryFromPatch(
  patch: Patch,
  bank: string,
  source: PatchSource = 'user',
  /**
   * Pass a stable id for content that can legitimately be re-imported — factory seeding in
   * particular, where a duplicate run must overwrite rather than accumulate a second copy.
   */
  id: string = newId(),
): LibraryEntry {
  return {
    id,
    name: patch.name || 'UNTITLED',
    group: patch.group,
    program: patch.program,
    payload: patch.payload.slice(),
    source,
    bank,
    updatedAt: Date.now(),
  }
}

export function patchFromEntry(entry: LibraryEntry): Patch {
  return patchFromPayload(entry.payload, entry.group, entry.program)
}

export async function allEntries(): Promise<LibraryEntry[]> {
  const rows = await (await db()).getAll('patches')
  // Numeric collation, or "Synth Group 10" sorts between groups 1 and 2.
  return rows.sort(
    (a, b) =>
      a.bank.localeCompare(b.bank, undefined, { numeric: true }) ||
      a.group - b.group ||
      a.program - b.program,
  )
}

export async function putEntries(entries: LibraryEntry[]): Promise<void> {
  const database = await db()
  const tx = database.transaction('patches', 'readwrite')
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done])
}

export async function deleteEntry(id: string): Promise<void> {
  await (await db()).delete('patches', id)
}

export async function deleteBySource(source: PatchSource): Promise<void> {
  const database = await db()
  const tx = database.transaction('patches', 'readwrite')
  const ids = await tx.store.index('by-source').getAllKeys(source)
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
}

export async function countEntries(): Promise<number> {
  return (await db()).count('patches')
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key)
}
