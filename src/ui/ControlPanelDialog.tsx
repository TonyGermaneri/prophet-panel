import { useState } from 'react'

import { connection, sync } from '../midi'
import { settings } from '../state/settings'
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

  const connect = async () => {
    setBusy(true)
    const state = await connection.connect()
    if (state === 'ready') await connection.identify()
    setBusy(false)
  }

  const ready = midi.state === 'ready'

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

        {/* Both of these let parameter control work while every patch transfer fails silently. */}
        {ready && !midi.sysexEnabled && (
          <p className="hint warn">
            MIDI is connected but <strong>SysEx is not permitted</strong> on this site, so knobs
            work and patch transfer cannot. Allow “control and reprogram your MIDI devices” for
            this site in the browser's permissions, then reconnect.
          </p>
        )}
        {ready && midi.sysexEnabled && !midi.deviceIdConfirmed && (
          <p className="hint">
            The instrument has not identified itself yet, so patch transfers are addressed to every
            device ID in the family until it does. Press Identify, or sync from the synth once.
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
