/**
 * Factory bank seeding.
 *
 * Only the three whole-bank files are bundled, not the 120 individual ones — each bank is simply
 * its forty program-data messages concatenated, so they carry identical content in three requests
 * instead of a hundred and twenty.
 */

import { parseSyxFile } from '../domain/patch'
import {
  deleteBySource,
  entryFromPatch,
  getMeta,
  type LibraryEntry,
  putEntries,
  setMeta,
} from './db'

const SEEDED_KEY = 'factory-seeded-v3'

const bankUrls = import.meta.glob('/patches/factory/*.syx', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

function setNumber(path: string): number | null {
  const match = /Set(\d+)-Group\d+/.exec(path.split('/').pop() ?? path)
  return match ? Number(match[1]) : null
}

function bankLabel(path: string): string {
  const n = setNumber(path)
  return n ? `Factory Set ${n}` : (path.split('/').pop() ?? path).replace('.syx', '')
}

export async function loadFactoryEntries(): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = []
  for (const [path, url] of Object.entries(bankUrls)) {
    const response = await fetch(url)
    if (!response.ok) continue
    const bank = bankLabel(path)
    const set = setNumber(path)
    const bytes = new Uint8Array(await response.arrayBuffer())
    for (const parsed of parseSyxFile(bytes)) {
      // The conversion addressed all three sets to group 5, so every one of them claims slots
      // 511-558 and the library shows the same numbers three times over. Spread them across one
      // group per set instead, which is both readable and how they would sit on the instrument.
      const patch = set ? { ...parsed, group: set - 1 } : parsed
      // A content-derived id makes seeding idempotent: re-running it overwrites the same rows
      // instead of appending a second copy of every factory patch.
      const id = `factory:${bank}:${patch.group}:${patch.program}`
      entries.push(entryFromPatch(patch, bank, 'factory', id))
    }
  }
  return entries
}

let seeding: Promise<number> | null = null

/** Populate the library on first run. A no-op afterwards, so user edits are never overwritten. */
export function seedFactoryPatches(): Promise<number> {
  // React's development double-effect calls this twice; sharing the in-flight promise keeps that
  // to a single pass, and the deterministic ids above make even a genuine race harmless.
  seeding ??= (async () => {
    if (await getMeta<boolean>(SEEDED_KEY)) return 0
    const entries = await loadFactoryEntries()
    await deleteBySource('factory')
    await putEntries(entries)
    await setMeta(SEEDED_KEY, true)
    return entries.length
  })()
  return seeding
}
