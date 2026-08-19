import { useEffect, useMemo, useState } from 'react'

import { slotLabel } from '../domain/patch'
import { settings } from '../state/settings'
import { useSettings } from '../ui/useBindings'
import { useLibrary } from '../ui/useLibrary'
import { useShared } from '../ui/useShared'
import { useUserGroups } from '../ui/useUserGroups'
import { auditionEntry } from './actions'
import { deleteEntry, entryFromPatch, type LibraryEntry, patchFromEntry, putEntries } from './db'
import { GroupDialog } from './GroupDialog'
import { GroupHeader } from './GroupHeader'
import { library } from './libraryStore'
import { PatchInfoDialog } from './PatchInfoDialog'
import { type UserGroup } from './userGroups'
import { UserTools } from './UserTools'

/**
 * The instrument's program memory: the factory set, plus anything read off the synth. Addressed by
 * slot, which is what separates it from every other tab — those are addressed by name.
 */
const PROGRAMS = 'programs'
/** The user's own groups, all under one tab. */
const USER = 'user'
/** One tab per imported zip, keyed by the filename it arrived as. */
const BUNDLE = 'bundle:'

/** A run of patches shown together. Grouped tabs give each block a heading; the others do not. */
interface Block {
  key: string
  group?: UserGroup
  entries: LibraryEntry[]
}

/** Docking the library beside the panel, or as a strip beneath the header. */
function DockIcon({ dock }: { dock: 'header' | 'aside' }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      {dock === 'header' ? (
        <line x1="3.5" y1="10" x2="20.5" y2="10" />
      ) : (
        <line x1="14" y1="4.5" x2="14" y2="19.5" />
      )}
    </svg>
  )
}

export function LibraryPanel({ onClose }: { onClose: () => void }) {
  const lib = useLibrary()
  const shared = useShared()
  const groups = useUserGroups()
  const prefs = useSettings()
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<string>(PROGRAMS)
  const [note, setNote] = useState<string | null>(null)
  const [info, setInfo] = useState<LibraryEntry | null>(null)
  /** Null while making a new group; a group while editing one. */
  const [editing, setEditing] = useState<UserGroup | null | undefined>(undefined)

  const collections = shared.collections
  const bundles = groups.bundles
  const ownGroups = groups.own

  const say = (message: string) => {
    setNote(message)
    window.setTimeout(() => setNote((current) => (current === message ? null : current)), 4000)
  }

  // A source removed or reloaded, or a bundle dropped, leaves the selection pointing at nothing.
  const known =
    tab === PROGRAMS ||
    tab === USER ||
    collections.some((c) => c.key === tab) ||
    bundles.some((b) => BUNDLE + b.file === tab)
  const active = known ? tab : PROGRAMS
  const collection = collections.find((c) => c.key === active)
  const bundle = bundles.find((b) => BUNDLE + b.file === active)

  const blocks = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const matches = (e: LibraryEntry) =>
      !needle ||
      e.name.toLowerCase().includes(needle) ||
      e.bank.toLowerCase().includes(needle) ||
      e.meta?.description?.toLowerCase().includes(needle) ||
      e.meta?.author?.toLowerCase().includes(needle) ||
      e.meta?.tags?.some((t) => t.toLowerCase().includes(needle))

    // Grouped tabs are laid out by their groups, empty ones included — a group you just made has
    // to be visible before there is anything to put in it.
    const shownGroups = active === USER ? ownGroups : bundle ? bundle.groups : null
    if (shownGroups) {
      return shownGroups.map(
        (group): Block => ({
          key: group.id,
          group,
          entries: lib.inGroup(group.id).filter(matches),
        }),
      )
    }

    const list = (collection ? collection.entries : lib.ungrouped)
      .filter(matches)
      .sort(
        (a, b) =>
          a.bank.localeCompare(b.bank, undefined, { numeric: true }) ||
          a.group - b.group ||
          a.program - b.program,
      )
    const banks = new Map<string, LibraryEntry[]>()
    for (const entry of list) {
      const at = banks.get(entry.bank) ?? []
      at.push(entry)
      banks.set(entry.bank, at)
    }
    return [...banks].map(([bank, entries]): Block => ({ key: bank, entries }))
    // The revisions cover content changes; the lists are derived from them.
  }, [lib.revision, shared.revision, groups.all, active, filter])

  const shown = useMemo(() => blocks.flatMap((b) => b.entries), [blocks])

  // Keep the header's stepper walking exactly what is on screen — tab and filter included.
  useEffect(() => {
    library.setOrder(shown.map((e) => e.id))
  }, [shown])

  const otherDock = prefs.libraryDock === 'header' ? 'aside' : 'header'

  /**
   * Copy a shared patch into the user's own library, since the shared one is not theirs to keep.
   * It lands in Programs rather than a group: a published patch arrives with the slot it was
   * written at, and that slot is the thing worth keeping about it.
   */
  const keep = async (entry: LibraryEntry) => {
    await putEntries([
      entryFromPatch(patchFromEntry(entry), collection?.name ?? entry.bank, 'user', undefined, {
        meta: entry.meta,
      }),
    ])
    await library.refresh()
    say(`Saved ${entry.name} to Programs`)
  }

  return (
    <section className={`library dock-${prefs.libraryDock}`}>
      <div className="library-head">
        <h2>Library</h2>
        <input
          className="search"
          placeholder="Search patches"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="count">{shown.length}</span>
        <div className="library-head-buttons">
          <button
            className="icon-button"
            onClick={() => settings.update({ libraryDock: otherDock })}
            title={otherDock === 'aside' ? 'Dock beside the panel' : 'Dock under the header'}
            aria-label={otherDock === 'aside' ? 'Dock beside the panel' : 'Dock under the header'}
          >
            <DockIcon dock={otherDock} />
          </button>
          <button className="icon" onClick={onClose} aria-label="Close library">
            ×
          </button>
        </div>
      </div>

      <div className="library-tabs" role="tablist" aria-label="Patch collections">
        <button
          role="tab"
          aria-selected={active === PROGRAMS}
          className={active === PROGRAMS ? 'tab selected' : 'tab'}
          title="The instrument's program memory, numbered as the synth numbers it"
          onClick={() => setTab(PROGRAMS)}
        >
          Programs
        </button>
        <button
          role="tab"
          aria-selected={active === USER}
          className={active === USER ? 'tab selected' : 'tab'}
          title="Your own patches, filed into groups you name"
          onClick={() => setTab(USER)}
        >
          User
          {ownGroups.length > 0 && <span className="tab-count">{ownGroups.length}</span>}
        </button>
        {bundles.map((b) => (
          <button
            key={b.file}
            role="tab"
            aria-selected={active === BUNDLE + b.file}
            className={active === BUNDLE + b.file ? 'tab selected' : 'tab'}
            title={`Imported from ${b.file}.zip${b.origin.description ? ` — ${b.origin.description}` : ''}`}
            onClick={() => setTab(BUNDLE + b.file)}
          >
            {b.file}
            <span className="tab-count">{b.groups.length}</span>
          </button>
        ))}
        {collections.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={active === c.key}
            className={active === c.key ? 'tab selected' : 'tab'}
            title={`${c.sourceLabel}${c.description ? ` — ${c.description}` : ''}`}
            onClick={() => setTab(c.key)}
          >
            {c.name}
            <span className="tab-count">{c.entries.length}</span>
          </button>
        ))}
      </div>

      {(active === USER || bundle) && (
        <UserTools bundle={bundle} onNewGroup={() => setEditing(null)} onNote={say} />
      )}
      {note && <p className="progress library-note">{note}</p>}

      <div className="library-list">
        {blocks.map((block) => (
          <div key={block.key} className="library-block">
            {block.group && (
              <GroupHeader
                group={block.group}
                count={block.entries.length}
                onEdit={block.group.bundle ? undefined : () => setEditing(block.group)}
                onNote={say}
              />
            )}
            <ul>
              {block.entries.map((entry) => (
                <li key={entry.id} className={entry.id === lib.selectedId ? 'selected' : undefined}>
                  <button
                    className="entry"
                    title={`${entry.meta?.description ?? entry.bank} — load onto the panel and send to the synth`}
                    onClick={() => auditionEntry(entry)}
                  >
                    <span className="entry-slot">{slotLabel(entry.group, entry.program)}</span>
                    <span className="entry-name">{entry.name}</span>
                  </button>
                  <button
                    className="link row-info"
                    title="Author, description and tags"
                    aria-label={`Info for ${entry.name}`}
                    onClick={() => setInfo(entry)}
                  >
                    i
                  </button>
                  {/* Shared patches are someone else's: they can be copied, not deleted. */}
                  {entry.source === 'shared' ? (
                    <button
                      className="link row-keep"
                      title="Save a copy to your own library"
                      aria-label={`Save ${entry.name} to your library`}
                      onClick={() => void keep(entry)}
                    >
                      +
                    </button>
                  ) : (
                    // Only user content can be deleted, and only on hover — the grid is dense.
                    entry.source !== 'factory' && (
                      <button
                        className="link danger row-delete"
                        title="Delete this patch"
                        aria-label={`Delete ${entry.name}`}
                        onClick={async () => {
                          await deleteEntry(entry.id)
                          await library.refresh()
                        }}
                      >
                        ×
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
            {block.group && !block.entries.length && (
              <p className="empty group-empty">
                {filter.trim() ? 'Nothing here matches.' : 'Empty — add the panel’s patch or some .syx files.'}
              </p>
            )}
          </div>
        ))}
        {!blocks.length && (
          <p className="empty">
            {active === USER
              ? 'No groups yet. Make one, then file the patch on the panel or any .syx files into it.'
              : 'No patches match.'}
          </p>
        )}
      </div>

      {editing !== undefined && (
        <GroupDialog
          group={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onCreated={() => setTab(USER)}
        />
      )}
      {info && <PatchInfoDialog entry={info} onClose={() => setInfo(null)} />}
    </section>
  )
}
