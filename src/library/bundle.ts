/**
 * Patch bundles: a zip holding exactly what a shared repository directory holds.
 *
 * Keeping the two sharing routes on one layout means a bundle can be unzipped into a repo and
 * published without conversion, and a published directory can be zipped and mailed to someone who
 * would rather not subscribe to anything. The manifest is what makes a zip self-describing — which
 * files belong together, what to call the tab they appear under, and who wrote what.
 *
 * A bundle is built from sections, one per file and per tab. Where those sections come from is the
 * caller's business: the library's own banks for a slot-shaped export, or the user's named groups
 * for a folder of patches that were never in slots at all.
 */

import { type Patch, parseSyxFile, toSyxFile } from '../domain/patch'
import { entryFromPatch, type LibraryEntry, type PatchMeta, patchFromEntry } from './db'
import {
  fromIsoDate,
  MANIFEST_FILE,
  MANIFEST_VERSION,
  parseManifest,
  type SharedCollection,
  type SharedManifest,
  type SharedPatchMeta,
  toIsoDate,
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
  createdAt?: number
  deviceId: number
}

/** One file and one tab in the bundle. Its entries are written in the order given. */
export interface BundleSection {
  name: string
  description?: string
  author?: string
  createdAt?: number
  entries: LibraryEntry[]
}

/** Only patches that actually carry authorship earn a line in the manifest. */
function patchMeta(entries: LibraryEntry[]): SharedPatchMeta[] | undefined {
  const list: SharedPatchMeta[] = []
  entries.forEach((entry, index) => {
    const meta = entry.meta
    if (!meta?.author && !meta?.description && !meta?.tags?.length && !meta?.createdAt) return
    list.push({
      index,
      // Carried even though the payload holds it too, so the manifest reads as a table of contents.
      name: entry.name,
      author: meta.author,
      description: meta.description,
      tags: meta.tags?.length ? meta.tags : undefined,
      createdAt: toIsoDate(meta.createdAt),
    })
  })
  return list.length ? list : undefined
}

/** Write sections to a zip, one `.syx` and one collection each. */
export function buildBundleFrom(sections: BundleSection[], options: BundleOptions): Uint8Array {
  const files: ZipFile[] = []
  const collections: SharedCollection[] = []
  const used = new Set<string>()

  for (const section of sections) {
    // Two sections that clean to the same filename would silently overwrite each other in the zip.
    let file = `${safeName(section.name)}.syx`
    for (let n = 2; used.has(file.toLowerCase()); n++) file = `${safeName(section.name)} (${n}).syx`
    used.add(file.toLowerCase())

    files.push({
      name: file,
      data: toSyxFile(section.entries.map(patchFromEntry), options.deviceId),
    })
    collections.push({
      id: collectionId(section.name),
      name: section.name,
      description: section.description,
      author: section.author,
      createdAt: toIsoDate(section.createdAt),
      files: [file],
      patches: patchMeta(section.entries),
    })
  }

  const manifest: SharedManifest = {
    version: MANIFEST_VERSION,
    name: options.name,
    description: options.description,
    author: options.author,
    createdAt: toIsoDate(options.createdAt),
    collections,
  }

  return writeZip([
    { name: MANIFEST_FILE, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n') },
    ...files,
  ])
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

  return buildBundleFrom(
    [...banks].map(([bank, list]) => ({
      name: bank,
      entries: [...list].sort((a, b) => a.group - b.group || a.program - b.program),
    })),
    options,
  )
}

/** A tab's worth of patches read back out of a bundle. */
export interface ImportedGroup {
  name: string
  description?: string
  author?: string
  createdAt?: number
  entries: LibraryEntry[]
}

export interface ImportedBundle {
  /** Every patch in the bundle, in the order the groups hold them. */
  entries: LibraryEntry[]
  groups: ImportedGroup[]
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

function baseName(path: string): string {
  return path.split('/').pop() ?? path
}

/** Apply a collection's metadata to the programs it describes, matched by position. */
function applyMeta(
  patches: Patch[],
  bank: string,
  meta: SharedPatchMeta[] | undefined,
): LibraryEntry[] {
  const byIndex = new Map((meta ?? []).map((m) => [m.index, m]))
  return patches.map((patch, index) => {
    const m = byIndex.get(index)
    const created = fromIsoDate(m?.createdAt)
    const carried =
      m && (m.author || m.description || m.tags?.length || created)
        ? {
            meta: {
              author: m.author,
              description: m.description,
              tags: m.tags,
              createdAt: created,
            } satisfies PatchMeta,
          }
        : {}
    return entryFromPatch(patch, bank, 'import', undefined, carried)
  })
}

/**
 * Read a bundle into groups of library entries. The manifest is used for naming and authorship when
 * present, but a zip that is simply a folder of `.syx` files still imports — someone sharing patches
 * should not have to learn a format first, and each file becomes a group named after itself.
 */
export async function readBundle(bytes: Uint8Array): Promise<ImportedBundle> {
  const files = await readZip(bytes)

  let manifest: SharedManifest | undefined
  const manifestFile = files.find((f) => baseName(f.name).toLowerCase() === MANIFEST_FILE)
  if (manifestFile) {
    try {
      manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestFile.data)))
    } catch {
      // A manifest we cannot read costs the collection names, not the patches.
      manifest = undefined
    }
  }

  // Matched on basename, since a zip made by hand may hold the whole directory rather than its
  // contents, and the manifest's paths are relative to itself either way.
  const byName = new Map<string, ZipFile>()
  for (const file of files) {
    if (isSyx(file.name)) byName.set(baseName(file.name).toLowerCase(), file)
  }

  const groups: ImportedGroup[] = []
  const skipped: string[] = []
  const claimed = new Set<string>()

  for (const collection of manifest?.collections ?? []) {
    const patches: Patch[] = []
    for (const path of collection.files) {
      const key = baseName(path).toLowerCase()
      const file = byName.get(key)
      // A file the manifest names but the zip does not hold is reported, not fatal.
      if (!file) {
        skipped.push(baseName(path))
        continue
      }
      claimed.add(key)
      const found = parseSyxFile(file.data)
      if (!found.length) skipped.push(baseName(file.name))
      patches.push(...found)
    }
    if (!patches.length) continue
    groups.push({
      name: collection.name,
      description: collection.description,
      author: collection.author,
      createdAt: fromIsoDate(collection.createdAt),
      entries: applyMeta(patches, collection.name, collection.patches),
    })
  }

  // Whatever the manifest did not account for still imports, named after its own file.
  for (const [key, file] of byName) {
    if (claimed.has(key)) continue
    const base = baseName(file.name)
    const patches = parseSyxFile(file.data)
    if (!patches.length) {
      skipped.push(base)
      continue
    }
    const name = base.replace(/\.syx$/i, '')
    groups.push({ name, entries: applyMeta(patches, name, undefined) })
  }

  return { entries: groups.flatMap((g) => g.entries), groups, manifest, skipped }
}
