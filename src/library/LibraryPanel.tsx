import { useEffect, useMemo, useState } from 'react'

import { slotLabel } from '../domain/patch'
import { settings } from '../state/settings'
import { useSettings } from '../ui/useBindings'
import { useLibrary } from '../ui/useLibrary'
import { auditionEntry } from './actions'
import { deleteEntry, type LibraryEntry } from './db'
import { library } from './libraryStore'

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
  const prefs = useSettings()
  const [filter, setFilter] = useState('')

  const matching = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const all = lib.all.sort(
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
    // The revision covers content changes; `all` is derived from it.
  }, [lib.revision, filter])

  // Keep the header's stepper walking exactly what is on screen, filter included.
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
                {/* Only user content can be deleted, and only on hover — the grid is dense. */}
                {entry.source !== 'factory' && (
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
