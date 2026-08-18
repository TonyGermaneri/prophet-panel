import { useEffect, useMemo, useState } from 'react'

import { slotLabel } from '../domain/patch'
import { settings } from '../state/settings'
import { useSettings } from '../ui/useBindings'
import { useLibrary } from '../ui/useLibrary'
import { useShared } from '../ui/useShared'
import { auditionEntry } from './actions'
import { deleteEntry, entryFromPatch, type LibraryEntry, patchFromEntry, putEntries } from './db'
import { library } from './libraryStore'

/** The user's own patches. Shared collections are addressed by their collection key. */
const MINE = 'mine'

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
  const prefs = useSettings()
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<string>(MINE)

  const collections = shared.collections
  // A source removed or reloaded while its tab was open leaves the selection pointing at nothing.
  const active = tab === MINE || collections.some((c) => c.key === tab) ? tab : MINE
  const collection = collections.find((c) => c.key === active)

  const matching = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const all = (collection ? collection.entries : lib.all)
      .slice()
      .sort(
        (a, b) =>
          a.bank.localeCompare(b.bank, undefined, { numeric: true }) ||
          a.group - b.group ||
          a.program - b.program,
      )
    return needle
      ? all.filter(
          (e) => e.name.toLowerCase().includes(needle) || e.bank.toLowerCase().includes(needle),
        )
      : all
    // The revisions cover content changes; the lists are derived from them.
  }, [lib.revision, shared.revision, active, filter])

  // Keep the header's stepper walking exactly what is on screen — tab and filter included.
  useEffect(() => {
    library.setOrder(matching.map((e) => e.id))
  }, [matching])

  /** One block per bank, so each block lays out as that group's five banks of eight. */
  const blocks = useMemo(() => {
    const grouped = new Map<string, LibraryEntry[]>()
    for (const entry of matching) {
      const list = grouped.get(entry.bank) ?? []
      list.push(entry)
      grouped.set(entry.bank, list)
    }
    return [...grouped.entries()]
  }, [matching])

  const otherDock = prefs.libraryDock === 'header' ? 'aside' : 'header'

  /** Copy a shared patch into the user's own library, since the shared one is not theirs to keep. */
  const keep = async (entry: LibraryEntry) => {
    await putEntries([
      entryFromPatch(patchFromEntry(entry), collection?.name ?? entry.bank, 'user'),
    ])
    await library.refresh()
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
        <span className="count">{matching.length}</span>
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

      {/* Tabs appear only once there is something to switch between. */}
      {collections.length > 0 && (
        <div className="library-tabs" role="tablist" aria-label="Patch collections">
          <button
            role="tab"
            aria-selected={active === MINE}
            className={active === MINE ? 'tab selected' : 'tab'}
            onClick={() => setTab(MINE)}
          >
            My Patches
          </button>
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
      )}

      <div className="library-list">
        {blocks.map(([bank, list]) => (
          <ul key={bank}>
            {list.map((entry) => (
              <li key={entry.id} className={entry.id === lib.selectedId ? 'selected' : undefined}>
                <button
                  className="entry"
                  title={`${entry.bank} — load onto the panel and send to the synth`}
                  onClick={() => auditionEntry(entry)}
                >
                  <span className="entry-slot">{slotLabel(entry.group, entry.program)}</span>
                  <span className="entry-name">{entry.name}</span>
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
        ))}
        {!blocks.length && <p className="empty">No patches match.</p>}
      </div>
    </section>
  )
}
