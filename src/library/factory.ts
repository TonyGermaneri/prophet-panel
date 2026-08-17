/**
 * Factory bank seeding.
 *
 * The bundled set is the Prophet-10's own program memory — all ten groups, 400 programs — captured
 * from the instrument by its Pgm Dump and stored as one file per group. Each program carries the
 * group and program it came from, so the library numbers them exactly as the instrument does.
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

const SEEDED_KEY = 'factory-seeded-device-v1'

const bankUrls = import.meta.glob('/patches/factory/*.syx', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

function bankLabel(path: string): string {
  const file = path.split('/').pop() ?? path
  const match = /Group\s*0*(\d+)/i.exec(file)
  return match ? `Factory Group ${Number(match[1])}` : file.replace('.syx', '')
}

export async function loadFactoryEntries(): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = []
  for (const [path, url] of Object.entries(bankUrls)) {
    const response = await fetch(url)
    if (!response.ok) continue
    const bank = bankLabel(path)
    const bytes = new Uint8Array(await response.arrayBuffer())
    for (const patch of parseSyxFile(bytes)) {
      // A slot-derived id makes seeding idempotent: re-running it overwrites the same rows rather
      // than appending a second copy of every program.
      entries.push(entryFromPatch(patch, bank, 'factory', `factory:${patch.group}:${patch.program}`))
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
