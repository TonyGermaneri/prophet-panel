/**
 * Where library rows are actually kept.
 *
 * IndexedDB in the browser; a file under Application Support in the plugin, where a WebView served
 * from a custom scheme cannot be trusted to have durable storage of its own. Ordering and every
 * other decision that does not depend on the store lives above this, in `db.ts`.
 */

import type { LibraryEntry, PatchSource } from '../entry'

export interface LibraryBackend {
  /** Every row, in no particular order — `allEntries` imposes the ordering. */
  all(): Promise<LibraryEntry[]>
  /** Insert or overwrite by id, as one atomic batch. */
  put(entries: LibraryEntry[]): Promise<void>
  remove(ids: string[]): Promise<void>
  removeBySource(source: PatchSource): Promise<void>
  count(): Promise<number>
  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>
}
