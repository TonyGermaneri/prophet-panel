/**
 * The patch library in IndexedDB, so it survives reloads and works with no backend.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { LibraryEntry, PatchSource } from '../entry'
import type { LibraryBackend } from './types'

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

function db(): Promise<IDBPDatabase<LibrarySchema>> {
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

export const backend: LibraryBackend = {
  async all() {
    return (await db()).getAll('patches')
  },

  async put(entries) {
    const database = await db()
    const tx = database.transaction('patches', 'readwrite')
    await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done])
  },

  async remove(ids) {
    const database = await db()
    const tx = database.transaction('patches', 'readwrite')
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
  },

  async removeBySource(source) {
    const database = await db()
    const tx = database.transaction('patches', 'readwrite')
    const ids = await tx.store.index('by-source').getAllKeys(source)
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
  },

  async count() {
    return (await db()).count('patches')
  },

  async getMeta<T>(key: string) {
    return (await db()).get('meta', key) as Promise<T | undefined>
  },

  async setMeta(key, value) {
    await (await db()).put('meta', value, key)
  },
}
