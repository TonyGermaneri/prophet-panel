import { useRef, useState } from 'react'

import { parseSyxFile } from '../domain/patch'
import { entryFromPatch, type LibraryEntry, putEntries } from '../library/db'
import { ExportDialog } from '../library/ExportDialog'
import { library } from '../library/libraryStore'
import { connection, sync } from '../midi'
import { settings } from '../state/settings'
import { store } from '../state/store'
import { Modal } from './Modal'
import { useSettings } from './useBindings'
import { useMidiStatus } from './useMidi'

const MANUAL_URL = 'https://sequential.com/wp-content/uploads/2021/02/Prophet-5-Users-Guide-1.3.pdf'
const REPO_URL = 'https://github.com/TonyGermaneri/prophet-panel'

const STATE_TEXT: Record<string, string> = {
  idle: 'Not connected',
  unsupported: 'Web MIDI is unavailable in this browser — use Chrome or Edge',
  denied: 'MIDI permission was denied',
  ready: 'Connected',
}

export function ControlPanelDialog({ onClose }: { onClose: () => void }) {
  const midi = useMidiStatus()
  const prefs = useSettings()
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const received = useRef(new Map<string, LibraryEntry>())
  const fileInput = useRef<HTMLInputElement>(null)

  const connect = async () => {
    setBusy(true)
    const state = await connection.connect()
    if (state === 'ready') await connection.identify()
    setBusy(false)
  }

  const saveCurrent = async () => {
    await putEntries([entryFromPatch(store.snapshot(), 'My Patches', 'user')])
    await library.refresh()
    setProgress('Saved to My Patches')
    window.setTimeout(() => setProgress(null), 2500)
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
    window.setTimeout(() => setProgress(null), 3000)
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
    setProgress('Listening — on the synth: GLOBALS, program 7 (Pgm Dump), choose ALL, press RECORD')
    sync.startCapture((patch) => {
      // Filed per group and keyed by slot, so a dump sent twice replaces rather than duplicates.
      const id = `device:${patch.group}:${patch.program}`
      received.current.set(id, entryFromPatch(patch, `Synth Group ${patch.group + 1}`, 'device', id))
      setProgress(`Listening — ${received.current.size} received`)
    })
  }

  const ready = midi.state === 'ready'

  if (exporting) return <ExportDialog onClose={() => setExporting(false)} />

  return (
    <Modal title="Control Panel" onClose={onClose}>
      <section className="dialog-section">
        <h3>MIDI</h3>

        <p className={ready ? 'status-line ok' : 'status-line'}>
          <span className={`dot ${ready ? 'on' : ''}`} />
          {midi.device
            ? `${midi.device.model} · OS ${midi.device.version} · device ID 0x${midi.deviceId.toString(16)}`
            : STATE_TEXT[midi.state]}
        </p>

        {ready && !midi.sysexEnabled && (
          <p className="hint warn">
            MIDI is connected but <strong>SysEx is not permitted</strong> on this site, so knobs
            work and patch transfer cannot. Allow “control and reprogram your MIDI devices” for
            this site in the browser's permissions, then reconnect.
          </p>
        )}
        {midi.sendError && <p className="hint warn">Last send failed: {midi.sendError}</p>}

        {!ready ? (
          <button
            className="primary"
            onClick={connect}
            disabled={busy || midi.state === 'unsupported'}
          >
            {busy ? 'Connecting…' : 'Connect MIDI'}
          </button>
        ) : (
          <>
            <label className="field">
              <span>Synth in</span>
              <select
                value={midi.inputId ?? ''}
                onChange={(e) => connection.setInput(e.target.value || null)}
              >
                <option value="">— none —</option>
                {midi.inputs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Synth out</span>
              <select
                value={midi.outputId ?? ''}
                onChange={(e) => connection.setOutput(e.target.value || null)}
              >
                <option value="">— none —</option>
                {midi.outputs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="dialog-actions">
              <button onClick={() => connection.identify()}>Identify</button>
              <button onClick={() => sync.requestEditBuffer()}>Sync from synth</button>
              <button onClick={() => sync.sendEditBuffer()}>Send to synth</button>
            </div>

            <label className="toggle">
              <input
                type="checkbox"
                checked={prefs.follow}
                onChange={(e) => {
                  sync.follow = e.target.checked
                  settings.update({ follow: e.target.checked })
                }}
              />
              Follow synth — pull its edit buffer when the program changes
            </label>
          </>
        )}
      </section>

      {ready && (
        <section className="dialog-section">
          <h3>Input Device</h3>
          <p className="dialog-blurb">
            A controller to play and automate the synth through. Its notes, control changes and
            aftertouch are passed on to the Prophet, and MIDI Bind listens to this device only.
          </p>

          <label className="field">
            <span>Device</span>
            <select
              value={midi.controllerInputId ?? ''}
              onChange={(e) => connection.setControllerInput(e.target.value || null)}
            >
              <option value="">— none —</option>
              {midi.controllerInputs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {!midi.controllerInputs.length && (
            <p className="hint">
              No inputs available besides the synth itself, which is excluded here — routing its own
              keyboard back to it would loop.
            </p>
          )}
        </section>
      )}

      <section className="dialog-section">
        <h3>Library</h3>
        <div className="dialog-actions">
          <button onClick={saveCurrent}>Save current</button>
          <button onClick={() => fileInput.current?.click()}>Import .syx</button>
          <button onClick={() => setExporting(true)}>Export…</button>
          <button
            className={receiving ? 'primary' : undefined}
            onClick={toggleReceive}
            disabled={!ready}
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
      </section>

      <section className="dialog-section">
        <h3>About</h3>
        <p className="byline">By Tony Germaneri</p>
        <p className="dialog-blurb">
          A browser control surface for the Sequential Prophet-10 Rev4 — play it, edit it, and
          load, save, send and sync patches over MIDI.
        </p>
        <ul className="dialog-links">
          <li>
            <a href={MANUAL_URL} target="_blank" rel="noopener noreferrer">
              Prophet-5 User’s Guide (PDF)
            </a>
            <span>The instrument manual, from Sequential</span>
          </li>
          <li>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              github.com/TonyGermaneri/prophet-panel
            </a>
            <span>Source code</span>
          </li>
        </ul>
      </section>
    </Modal>
  )
}
