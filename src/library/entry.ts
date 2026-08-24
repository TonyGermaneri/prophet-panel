/**
 * What a library row is, independent of where it is kept.
 *
 * Entries store the raw 133-byte payload rather than a decoded parameter struct, so anything the
 * app does not yet understand still round-trips out to a .syx file unchanged.
 */

import { type Patch, patchFromPayload } from '../domain/patch'

/**
 * Where an entry came from. Everything but `shared` is the user's own and is persisted; `shared`
 * entries are read from someone else's repository at load time and held only in memory.
 */
export type PatchSource = 'factory' | 'user' | 'device' | 'import' | 'shared'

/**
 * What a patch is beyond its bytes: who made it, when, and what it is for.
 *
 * None of this reaches the instrument — the 133-byte payload has no room for it — so it lives
 * beside the patch here and travels with it in a bundle's manifest. Every field is optional
 * because a patch pulled off the synth or read from a stranger's .syx file has none of them.
 */
export interface PatchMeta {
  author?: string
  description?: string
  tags?: string[]
  /** When the patch was written, as epoch ms. `updatedAt` tracks the row; this tracks the sound. */
  createdAt?: number
}

export interface LibraryEntry {
  id: string
  name: string
  group: number
  program: number
  payload: Uint8Array
  source: PatchSource
  /** Grouping label shown in the browser, e.g. "Factory Set 1" or "From Prophet-10". */
  bank: string
  /** Which shared collection's tab this belongs to. Absent for the user's own patches. */
  collectionKey?: string
  /**
   * The user group this patch was filed into. Grouped patches are addressed by name rather than by
   * slot, which is what lets the user tab hold arbitrary files instead of a 400-program grid.
   */
  groupId?: string
  meta?: PatchMeta
  updatedAt: number
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
  /** Filing and authorship, for the patches that carry any. */
  extra: Pick<LibraryEntry, 'groupId' | 'meta'> = {},
): LibraryEntry {
  return {
    id,
    name: patch.name || 'UNTITLED',
    group: patch.group,
    program: patch.program,
    payload: patch.payload.slice(),
    source,
    bank,
    ...extra,
    updatedAt: Date.now(),
  }
}

export function patchFromEntry(entry: LibraryEntry): Patch {
  return patchFromPayload(entry.payload, entry.group, entry.program)
}
