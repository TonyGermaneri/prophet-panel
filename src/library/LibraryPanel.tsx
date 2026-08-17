import { useEffect, useMemo, useRef, useState } from 'react'

import { parseSyxFile, slotLabel, toSyxFile } from '../domain/patch'
import { connection, sync } from '../midi'
import { store } from '../state/store'
import {
  allEntries,
  deleteEntry,
  entryFromPatch,
  type LibraryEntry,
  patchFromEntry,
  putEntries,
} from './db'
import { seedFactoryPatches } from './factory'

function download(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function LibraryPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = async () => setEntries(await allEntries())

  useEffect(() => {
    void (async () => {
      await seedFactoryPatches()
      await refresh()
    })()
  }, [])

  const banks = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const matching = needle
      ? entries.filter(
          (e) => e.name.toLowerCase().includes(needle) || e.bank.toLowerCase().includes(needle),
        )
      : entries
    const grouped = new Map<string, LibraryEntry[]>()
    for (const entry of matching) {
      const list = grouped.get(entry.bank) ?? []
      list.push(entry)
      grouped.set(entry.bank, list)
    }
    return [...grouped.entries()]
  }, [entries, filter])

  /**
   * Selecting a patch does both halves at once: the panel takes the patch, and the synth gets it
   * in its edit buffer so you hear what you are looking at.
   */
  const audition = (entry: LibraryEntry) => {
    const patch = patchFromEntry(entry)
    setSelected(entry.id)
    store.loadPatch(patch)
    store.setSlot(entry.group, entry.program)
    sync.sendEditBuffer(patch)
  }

  const saveCurrent = async () => {
    await putEntries([entryFromPatch(store.snapshot(), 'My Patches', 'user')])
    await refresh()
  }

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const added: LibraryEntry[] = []
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const patches = parseSyxFile(bytes)
      const bank = file.name.replace(/\.syx$/i, '')
      for (const patch of patches) added.push(entryFromPatch(patch, bank, 'import'))
    }
    if (added.length) {
      await putEntries(added)
      await refresh()
    }
    setProgress(added.length ? `Imported ${added.length} patches` : 'No patches found in file')
    window.setTimeout(() => setProgress(null), 2500)
  }

  const exportBank = (bank: string, list: LibraryEntry[]) => {
    download(`${bank}.syx`, toSyxFile(list.map(patchFromEntry), connection.deviceId))
  }

  const fetchFromSynth = async () => {
    const added: LibraryEntry[] = []
    setProgress('Fetching group 1…')
    await sync.fetchGroups(
      [0],
      (patch) => added.push(entryFromPatch(patch, 'From Synth', 'device')),
      (done, total) => setProgress(`Fetching ${done}/${total}…`),
    )
    if (added.length) {
      await putEntries(added)
      await refresh()
    }
    setProgress(added.length ? `Fetched ${added.length} patches` : 'No response from synth')
    window.setTimeout(() => setProgress(null), 3000)
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
          <button onClick={fetchFromSynth} disabled={connection.state !== 'ready'}>
            Fetch from synth
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
              <button className="link" onClick={() => exportBank(bank, list)}>
                Export
              </button>
            </header>
            <ul>
              {list.map((entry) => (
                <li key={entry.id} className={entry.id === selected ? 'selected' : undefined}>
                  <button
                    className="entry"
                    title="Load onto the panel and send to the synth"
                    onClick={() => audition(entry)}
                  >
                    <span className="entry-slot">{slotLabel(entry.group, entry.program)}</span>
                    <span className="entry-name">{entry.name}</span>
                  </button>
                  <button
                    className="link"
                    title="Send again, e.g. after editing on the panel"
                    onClick={() => audition(entry)}
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
                        await refresh()
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
