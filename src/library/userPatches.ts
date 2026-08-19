/**
 * Making, filing and sharing the user's own patches.
 *
 * Everything the User tab does goes through here, so the rules live in one place: a patch belongs
 * to exactly one group, a rename reaches the payload as well as the row, and a group and its
 * patches are deleted together rather than leaving orphans behind in the database.
 */

import { modelName } from '../domain/model'
import { parseSyxFile, readName, writeName } from '../domain/patch'
import { connection } from '../midi'
import { settings } from '../state/settings'
import { store } from '../state/store'
import { buildBundleFrom, readBundle } from './bundle'
import {
  deleteEntries,
  entryFromPatch,
  type LibraryEntry,
  type PatchMeta,
  putEntries,
} from './db'
import { download } from './download'
import { library } from './libraryStore'
import { type UserGroup, userGroups } from './userGroups'

/** Capture whatever is on the panel right now, byte for byte, into a group. */
export async function addCurrentPatch(groupId: string): Promise<LibraryEntry> {
  const patch = store.snapshot()
  const group = userGroups.group(groupId)
  const entry = entryFromPatch(patch, group?.name ?? 'User', 'user', undefined, {
    // The group's author is the sensible default for something made in it, and editable after.
    groupId,
    meta: { author: group?.author, createdAt: Date.now() },
  })
  await putEntries([entry])
  await library.refresh()
  return entry
}

export interface AddedFiles {
  added: LibraryEntry[]
  /** Files that held no readable program data, named so the user can go and look at them. */
  skipped: string[]
}

/**
 * Add arbitrary `.syx` files to a group.
 *
 * A file may hold one program or a whole bank — the instrument's own dump is just program-data
 * messages end to end — so a single file can arrive as forty patches. The filename becomes the
 * description when nothing better is known, since that is usually where the only human-written
 * information about a downloaded patch lives.
 */
export async function addFiles(groupId: string, files: FileList | File[]): Promise<AddedFiles> {
  const group = userGroups.group(groupId)
  const added: LibraryEntry[] = []
  const skipped: string[] = []
  // One timestamp per patch, ascending, so the group's order matches the order they were chosen.
  let stamp = Date.now()

  // A FileList is a live view of the input that picked it, and the input is cleared as soon as the
  // change event returns — so the choice has to be copied out before the first await, or the rest
  // of the files vanish mid-loop.
  for (const file of [...files]) {
    const patches = parseSyxFile(new Uint8Array(await file.arrayBuffer()))
    if (!patches.length) {
      skipped.push(file.name)
      continue
    }
    const from = file.name.replace(/\.syx$/i, '')
    patches.forEach((patch, i) => {
      added.push(
        // Imported rather than authored: a .syx someone sent is theirs, however it got filed.
        entryFromPatch(patch, group?.name ?? 'User', 'import', undefined, {
          groupId,
          meta: {
            author: group?.author,
            // The filename is usually the only human-written thing a downloaded patch arrives with.
            description: patches.length > 1 ? `${from} — program ${i + 1}` : from,
            createdAt: stamp++,
          },
        }),
      )
    })
  }

  if (added.length) {
    await putEntries(added)
    await library.refresh()
  }
  return { added, skipped }
}

/**
 * Rename, re-describe and re-file one patch, in a single write.
 *
 * All three together rather than one call each: every write starts from the row the caller is
 * holding, so two of them in a row would have the second overwrite the first with what it saw
 * before the change. `groupId` left out means leave the filing alone; `null` means ungroup.
 */
export async function savePatch(
  entry: LibraryEntry,
  changes: { name?: string; meta?: PatchMeta; groupId?: string | null },
): Promise<void> {
  const payload = entry.payload.slice()
  // The name lives in the payload, so it travels with the patch rather than only in the row.
  if (changes.name !== undefined) writeName(payload, changes.name)

  const moved = changes.groupId !== undefined
  const group = changes.groupId ? userGroups.group(changes.groupId) : undefined

  await putEntries([
    {
      ...entry,
      payload,
      name: readName(payload) || entry.name,
      meta: { ...entry.meta, ...changes.meta },
      ...(moved ? { groupId: changes.groupId ?? undefined, bank: group?.name ?? entry.bank } : {}),
      updatedAt: Date.now(),
    },
  ])
  await library.refresh()
}

/**
 * The group patches are filed into when the caller has not been given a choice.
 *
 * Made on demand rather than seeded at startup, so someone who never opens the User tab never has
 * an empty folder sitting in it — and the first save from the control panel still lands somewhere
 * named instead of asking a question before it will do anything.
 */
export async function defaultGroup(): Promise<UserGroup> {
  return userGroups.own[0] ?? (await userGroups.create({ name: 'My Patches' }))
}

/** Delete groups together with everything filed in them; a group is its patches. */
export async function deleteGroups(ids: string[]): Promise<void> {
  const drop = new Set(ids)
  await deleteEntries(library.all.filter((e) => e.groupId && drop.has(e.groupId)).map((e) => e.id))
  await userGroups.remove(ids)
  await library.refresh()
}

/** Keep a group's rows in step with its name, so its patches export under the right heading. */
export async function renameGroup(id: string, patch: Partial<UserGroup>): Promise<void> {
  await userGroups.update(id, patch)
  const group = userGroups.group(id)
  if (!group) return
  const rows = library.inGroup(id).filter((e) => e.bank !== group.name)
  if (rows.length) {
    await putEntries(rows.map((e) => ({ ...e, bank: group.name })))
    await library.refresh()
  }
}

function fileSafe(name: string): string {
  return name.replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Patches'
}

/**
 * Write groups out as one zip — the same manifest-and-`.syx` directory a shared repository holds,
 * so an exported group can be unpacked into a repo and published without conversion.
 */
export function exportGroups(groups: UserGroup[], bundleName?: string): number {
  const sections = groups.map((group) => ({
    name: group.name,
    description: group.description,
    author: group.author,
    createdAt: group.createdAt,
    entries: library.inGroup(group.id),
  }))
  const count = sections.reduce((n, s) => n + s.entries.length, 0)
  if (!count) return 0

  const name =
    bundleName?.trim() ||
    (groups.length === 1 ? groups[0].name : `${modelName(settings.current.model)} Patches`)
  const only = groups.length === 1 ? groups[0] : undefined

  download(
    `${fileSafe(name)}.zip`,
    buildBundleFrom(sections, {
      name,
      description: only?.description,
      author: only?.author,
      createdAt: only?.createdAt ?? Date.now(),
      deviceId: connection.deviceId,
    }),
    'application/zip',
  )
  return count
}

export interface ImportedBundleSummary {
  /** The zip's name without its extension — the label of the tab its groups appear under. */
  file: string
  groups: UserGroup[]
  patches: number
  skipped: string[]
  /** Set when a zip of the same name was already here and has been replaced. */
  replaced: boolean
}

/** "6 patches in 2 groups" — a sentence, rather than parenthesised plurals in a form letter. */
export function summariseImport(result: ImportedBundleSummary): string {
  const groups = `${result.groups.length} group${result.groups.length === 1 ? '' : 's'}`
  const patches = `${result.patches} patch${result.patches === 1 ? '' : 'es'}`
  const skipped = result.skipped.length
    ? `, ${result.skipped.length} file${result.skipped.length === 1 ? '' : 's'} skipped`
    : ''
  return `${result.replaced ? 'Replaced' : 'Imported'} ${result.file} — ${patches} in ${groups}${skipped}`
}

/**
 * Import a zip as its own tab.
 *
 * Identity is the filename: importing `Pads.zip` a second time replaces what the first import left
 * behind rather than stacking a duplicate tab beside it, so publishing an updated bundle and
 * re-importing it is the whole update story.
 */
export async function importBundle(file: File): Promise<ImportedBundleSummary> {
  const bundle = await readBundle(new Uint8Array(await file.arrayBuffer()))
  const label = file.name.replace(/\.zip$/i, '') || 'Imported'

  if (!bundle.groups.length) {
    return { file: label, groups: [], patches: 0, skipped: bundle.skipped, replaced: false }
  }

  const previous = userGroups.all.filter((g) => g.bundle?.file === label)
  const importedAt = Date.now()
  const origin = {
    file: label,
    importedAt,
    name: bundle.manifest?.name,
    description: bundle.manifest?.description,
    author: bundle.manifest?.author,
  }

  const groups: UserGroup[] = bundle.groups.map((group, i) => ({
    id: crypto.randomUUID(),
    name: group.name,
    description: group.description,
    author: group.author ?? bundle.manifest?.author,
    // The manifest's own date where it gave one; otherwise the import, staggered by position so
    // the groups keep the order the manifest listed them in.
    createdAt: group.createdAt ?? importedAt + i,
    updatedAt: importedAt,
    bundle: origin,
  }))

  // The old copy's patches go first: a replaced import must not leave its rows behind unreachable.
  await deleteEntries(
    library.all.filter((e) => e.groupId && previous.some((g) => g.id === e.groupId)).map((e) => e.id),
  )
  await userGroups.replaceBundle(label, groups)
  await putEntries(
    bundle.groups.flatMap((group, i) =>
      group.entries.map((entry) => ({ ...entry, groupId: groups[i].id })),
    ),
  )
  await library.refresh()

  return {
    file: label,
    groups,
    patches: bundle.entries.length,
    skipped: bundle.skipped,
    replaced: previous.length > 0,
  }
}
