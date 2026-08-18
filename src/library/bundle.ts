/**
 * Patch bundles: a zip holding exactly what a shared repository directory holds.
 *
 * Keeping the two sharing routes on one layout means a bundle can be unzipped into a repo and
 * published without conversion, and a published directory can be zipped and mailed to someone who
 * would rather not subscribe to anything. The manifest is what makes a zip self-describing — which
 * files belong together, and what to call the tab they appear under.
 */

import { type Patch, parseSyxFile, toSyxFile } from '../domain/patch'
import { entryFromPatch, type LibraryEntry, patchFromEntry } from './db'
import {
  MANIFEST_FILE,
  MANIFEST_VERSION,
  parseManifest,
  type SharedCollection,
  type SharedManifest,
} from './manifest'
import { readZip, writeZip, type ZipFile } from './zip'

/** Bank names become filenames, so anything a filesystem would object to has to go. */
function safeName(name: string): string {
  const clean = name.replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean || 'Patches'
}

function collectionId(name: string): string {
  return (
    safeName(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'patches'
  )
}

export interface BundleOptions {
  name: string
  description?: string
  author?: string
  deviceId: number
}

/**
 * Build a bundle from library entries, one file and one collection per bank.
 *
 * Banks are the unit the library already groups by, so a bundle round-trips through a repository
 * with its structure intact: each bank arrives at the other end as its own tab rather than as one
 * flat pile that has to be sorted out by hand.
 */
export function buildBundle(entries: LibraryEntry[], options: BundleOptions): Uint8Array {
  const banks = new Map<string, LibraryEntry[]>()
  for (const entry of entries) {
    const list = banks.get(entry.bank) ?? []
    list.push(entry)
    banks.set(entry.bank, list)
  }

  const files: ZipFile[] = []
  const collections: SharedCollection[] = []
  const used = new Set<string>()

  for (const [bank, list] of banks) {
    // Two banks that clean to the same filename would silently overwrite each other in the zip.
    let file = `${safeName(bank)}.syx`
    for (let n = 2; used.has(file.toLowerCase()); n++) file = `${safeName(bank)} (${n}).syx`
    used.add(file.toLowerCase())

    const ordered = [...list].sort((a, b) => a.group - b.group || a.program - b.program)
    files.push({ name: file, data: toSyxFile(ordered.map(patchFromEntry), options.deviceId) })
    collections.push({ id: collectionId(bank), name: bank, files: [file] })
  }

  const manifest: SharedManifest = {
    version: MANIFEST_VERSION,
    name: options.name,
    description: options.description,
    author: options.author,
    collections,
  }

  return writeZip([
    { name: MANIFEST_FILE, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n') },
    ...files,
  ])
}

export interface ImportedBundle {
  entries: LibraryEntry[]
  /** Present when the zip carried a manifest; a plain folder of .syx files is still accepted. */
  manifest?: SharedManifest
  /** Files in the zip that held no readable program data. */
  skipped: string[]
}

function isSyx(name: string): boolean {
  const base = name.split('/').pop() ?? name
  // Zips from macOS carry a parallel __MACOSX tree of resource forks with the same names.
  return /\.syx$/i.test(base) && !base.startsWith('.') && !name.startsWith('__MACOSX/')
}

/**
 * Read a bundle into library entries. The manifest is used for naming when present, but a zip that
 * is simply a folder of `.syx` files still imports — someone sharing patches should not have to
 * learn a format first.
 */
export async function readBundle(bytes: Uint8Array): Promise<ImportedBundle> {
  const files = await readZip(bytes)

  let manifest: SharedManifest | undefined
  const manifestFile = files.find((f) => (f.name.split('/').pop() ?? '').toLowerCase() === MANIFEST_FILE)
  if (manifestFile) {
    try {
      manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestFile.data)))
    } catch {
      // A manifest we cannot read costs the collection names, not the patches.
      manifest = undefined
    }
  }

  // A file's collection decides its bank; anything the manifest does not mention keeps its own name.
  const bankByFile = new Map<string, string>()
  for (const collection of manifest?.collections ?? []) {
    for (const file of collection.files) {
      bankByFile.set((file.split('/').pop() ?? file).toLowerCase(), collection.name)
    }
  }

  const entries: LibraryEntry[] = []
  const skipped: string[] = []

  for (const file of files) {
    if (!isSyx(file.name)) continue
    const base = file.name.split('/').pop() ?? file.name
    const patches: Patch[] = parseSyxFile(file.data)
    if (!patches.length) {
      skipped.push(base)
      continue
    }
    const bank = bankByFile.get(base.toLowerCase()) ?? base.replace(/\.syx$/i, '')
    for (const patch of patches) entries.push(entryFromPatch(patch, bank, 'import'))
  }

  return { entries, manifest, skipped }
}
