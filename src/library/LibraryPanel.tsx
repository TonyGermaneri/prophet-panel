import { useEffect, useMemo, useRef, useState } from 'react'

import { parseSyxFile, slotLabel, toSyxFile } from '../domain/patch'
import { connection, sync } from '../midi'
import { store } from '../state/store'
import { useLibrary } from '../ui/useLibrary'
import { auditionEntry } from './actions'
import { deleteEntry, entryFromPatch, type LibraryEntry, patchFromEntry, putEntries } from './db'
import { library } from './libraryStore'

function download(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer], { type: 'application/octet-stream' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function LibraryPanel({ onClose }: { onClose: () => void }) {
  const lib = useLibrary()
  const [filter, setFilter] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [receiving, setReceiving] = useState(false)
  const received = useRef(new Map<string, LibraryEntry>())
  const fileInput = useRef<HTMLInputElement>(null)

  const matching = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const all = lib.all.sort(
      (a, b) => a.bank.localeCompare(b.bank) || a.group - b.group || a.program - b.program,
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

  const banks = useMemo(() => {
    const grouped = new Map<string, LibraryEntry[]>()
    for (const entry of matching) {
      const list = grouped.get(entry.bank) ?? []
      list.push(entry)
      grouped.set(entry.bank, list)
    }
    return [...grouped.entries()]
  }, [matching])

  const saveCurrent = async () => {
    await putEntries([entryFromPatch(store.snapshot(), 'My Patches', 'user')])
    await library.refresh()
  }

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const added: LibraryEntry[] = []
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const bank = file.name.replace(/\.syx$/i, '')
      for (const patch of parseSyxFile(bytes)) added.push(entryFromPatch(patch, bank, 'import'))
    }
    if (added.length) {
      await putEntries(added)
      await library.refresh()
    }
    setProgress(added.length ? `Imported ${added.length} patches` : 'No patches found in file')
    window.setTimeout(() => setProgress(null), 2500)
  }

  /**
   * The instrument answers no sysex request, so its memory cannot be pulled. It does dump from its
   * own front panel, so this arms a listener and the player triggers the dump on the synth.
   */
  const toggleReceive = async () => {
    if (receiving) {
      sync.stopCapture()
      setReceiving(false)
      const collected = [...received.current.values()]
      received.current.clear()
      if (collected.length) {
        await putEntries(collected)
        await library.refresh()
      }
      setProgress(collected.length ? `Received ${collected.length} patches` : 'Nothing received')
      window.setTimeout(() => setProgress(null), 3000)
      return
    }

    received.current.clear()
    setReceiving(true)
    setProgress('Listening — start a dump on the synth (GLOBALS, then Pgm Dump)')
    sync.startCapture((patch) => {
      // Keyed by slot, so a dump sent twice replaces rather than duplicates.
      const id = `device:${patch.group}:${patch.program}`
      received.current.set(id, entryFromPatch(patch, 'From Synth', 'device', id))
      setProgress(`Listening — ${received.current.size} received`)
    })
  }

  return (
    <aside className="library">
      <div className="library-head">
        <h2>Library</h2>
        <button className="icon" onClick={onClose} aria-label="Close library">
          ×
        </button>
      </div>

      <div className="library-actions">
        <input
          className="search"
          placeholder="Search patches"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="row">
          <button onClick={saveCurrent}>Save current</button>
          <button onClick={() => fileInput.current?.click()}>Import .syx</button>
          <button
            className={receiving ? 'primary' : undefined}
            onClick={toggleReceive}
            disabled={connection.state !== 'ready'}
            title="Listen for program dumps sent from the instrument"
          >
            {receiving ? 'Stop receiving' : 'Receive dump'}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".syx"
          multiple
          hidden
          onChange={(e) => {
            void importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {progress && <p className="progress">{progress}</p>}
      </div>

      <div className="library-list">
        {banks.map(([bank, list]) => (
          <section key={bank}>
            <header>
              <h3>{bank}</h3>
              <span className="count">{list.length}</span>
              <button
                className="link"
                onClick={() =>
                  download(`${bank}.syx`, toSyxFile(list.map(patchFromEntry), connection.deviceId))
                }
              >
                Export
              </button>
            </header>
            <ul>
              {list.map((entry) => (
                <li key={entry.id} className={entry.id === lib.selectedId ? 'selected' : undefined}>
                  <button
                    className="entry"
                    title="Load onto the panel and send to the synth"
                    onClick={() => auditionEntry(entry)}
                  >
                    <span className="entry-slot">{slotLabel(entry.group, entry.program)}</span>
                    <span className="entry-name">{entry.name}</span>
                  </button>
                  <button
                    className="link"
                    title="Send again, e.g. after editing on the panel"
                    onClick={() => auditionEntry(entry)}
                  >
                    Resend
                  </button>
                  <button
                    className="link"
                    onClick={() =>
                      download(
                        `${entry.name || 'patch'}.syx`,
                        toSyxFile([patchFromEntry(entry)], connection.deviceId),
                      )
                    }
                  >
                    .syx
                  </button>
                  {entry.source !== 'factory' && (
                    <button
                      className="link danger"
                      onClick={async () => {
                        await deleteEntry(entry.id)
                        await library.refresh()
                      }}
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!banks.length && <p className="empty">No patches match.</p>}
      </div>
    </aside>
  )
}
