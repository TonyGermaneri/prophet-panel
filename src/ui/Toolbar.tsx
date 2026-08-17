import { useState } from 'react'

import { bankOf, programInBank } from '../domain/patch'
import { connection, sync } from '../midi'
import { usePatchMeta } from '../state/hooks'
import { settings } from '../state/settings'
import { store } from '../state/store'
import { useBindings, useSettings } from './useBindings'
import { useMidiStatus } from './useMidi'

const STATE_TEXT: Record<string, string> = {
  idle: 'Not connected',
  unsupported: 'Web MIDI unavailable — use Chrome or Edge',
  denied: 'MIDI permission denied',
  ready: 'Connected',
}

export function Toolbar({
  onToggleLibrary,
  onToggleMonitor,
}: {
  onToggleLibrary: () => void
  onToggleMonitor: () => void
}) {
  const midi = useMidiStatus()
  const meta = usePatchMeta()
  const prefs = useSettings()
  const bind = useBindings()
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    const state = await connection.connect()
    if (state === 'ready') await connection.identify()
    setBusy(false)
  }

  const ready = midi.state === 'ready'

  return (
    <header className="toolbar">
      <div className="toolbar-group brand">
        <span className="brand-mark">prophet~10</span>
        <span className="brand-sub">control panel</span>
      </div>

      <div className="toolbar-group patch-id">
        <span className="slot">
          {meta.group + 1}
          {bankOf(meta.program)}
          {programInBank(meta.program)}
        </span>
        <input
          className="patch-name"
          value={meta.name}
          maxLength={20}
          spellCheck={false}
          onChange={(e) => store.setName(e.target.value)}
          aria-label="Patch name"
        />
      </div>

      <div className="toolbar-group">
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
            <select
              value={midi.inputId ?? ''}
              onChange={(e) => connection.setInput(e.target.value || null)}
              aria-label="MIDI input"
            >
              <option value="">— input —</option>
              {midi.inputs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={midi.outputId ?? ''}
              onChange={(e) => connection.setOutput(e.target.value || null)}
              aria-label="MIDI output"
            >
              <option value="">— output —</option>
              {midi.outputs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={() => connection.identify()}>Identify</button>
            <button onClick={() => sync.requestEditBuffer()}>Sync from synth</button>
            <button onClick={() => sync.sendEditBuffer()}>Send to synth</button>
            <label className="toggle" title="Pull the synth's edit buffer when its program changes">
              <input
                type="checkbox"
                checked={prefs.follow}
                onChange={(e) => {
                  sync.follow = e.target.checked
                  settings.update({ follow: e.target.checked })
                }}
              />
              Follow synth
            </label>
          </>
        )}
      </div>

      <div className="toolbar-group status">
        <span className={`dot ${ready ? 'on' : ''}`} />
        <span>
          {midi.device
            ? `${midi.device.model} · OS ${midi.device.version} · ID 0x${midi.deviceId.toString(16)}`
            : STATE_TEXT[midi.state]}
        </span>
      </div>

      <div className="toolbar-group">
        <label className="toggle" title="Hide the keyboard, wheels and nameplate">
          <input
            type="checkbox"
            checked={prefs.hideKeyboard}
            onChange={(e) => settings.update({ hideKeyboard: e.target.checked })}
          />
          Hide keyboard
        </label>
        <button
          className={bind.active ? 'primary' : undefined}
          onClick={() => bind.setActive(!bind.active)}
          aria-pressed={bind.active}
        >
          MIDI Bind
        </button>
        <button onClick={onToggleMonitor}>Monitor</button>
        <button onClick={onToggleLibrary}>Library</button>
      </div>
    </header>
  )
}
