/**
 * The patch library.
 *
 * This is the whole app's view of stored patches: the types, the ordering, and the operations.
 * Where the rows physically live is the backend's business — IndexedDB in the browser, a file on
 * disk in the plugin — and nothing above this module needs to know which.
 */

import { backend } from '@library-backend'

import type { LibraryEntry, PatchSource } from './entry'

export { entryFromPatch, patchFromEntry } from './entry'
export type { LibraryEntry, PatchMeta, PatchSource } from './entry'

export async function allEntries(): Promise<LibraryEntry[]> {
  const rows = await backend.all()
  // Numeric collation, or "Synth Group 10" sorts between groups 1 and 2.
  return rows.sort(
    (a, b) =>
      a.bank.localeCompare(b.bank, undefined, { numeric: true }) ||
      a.group - b.group ||
      a.program - b.program,
  )
}

export async function putEntries(entries: LibraryEntry[]): Promise<void> {
  if (!entries.length) return
  await backend.put(entries)
}

export async function deleteEntry(id: string): Promise<void> {
  await backend.remove([id])
}

export async function deleteEntries(ids: string[]): Promise<void> {
  if (!ids.length) return
  await backend.remove(ids)
}

export async function deleteBySource(source: PatchSource): Promise<void> {
  await backend.removeBySource(source)
}

export async function countEntries(): Promise<number> {
  return backend.count()
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return backend.getMeta<T>(key)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await backend.setMeta(key, value)
}
