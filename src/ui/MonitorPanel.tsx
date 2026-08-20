import { useSyncExternalStore } from 'react'

import { connection, sync } from '../midi'
import { type Direction, monitor } from '../midi/monitor'
import { useMidiStatus } from './useMidi'

const DIRECTION_GLYPH: Record<Direction, string> = { in: '←', out: '→', ctrl: '⇢' }
const DIRECTION_TITLE: Record<Direction, string> = {
  in: 'From the synth',
  out: 'To the synth',
  ctrl: 'From the input device',
}

export function MonitorPanel({ onClose }: { onClose: () => void }) {
  const entries = useSyncExternalStore(
    (fn) => monitor.subscribe(fn),
    () => monitor.snapshot,
    () => monitor.snapshot,
  )
  const midi = useMidiStatus()

  const sysexIn = entries.filter((e) => e.direction === 'in' && e.kind === 'SysEx').length
  const anyIn = entries.some((e) => e.direction === 'in')

  return (
    <aside className="monitor">
      <div className="library-head">
        <h2>MIDI Monitor</h2>
        <button className="icon" onClick={onClose} aria-label="Close monitor">
          ×
        </button>
      </div>

      <div className="library-actions">
        <div className="row">
          <button onClick={() => connection.identify()}>Device inquiry</button>
          <button onClick={() => sync.requestEditBuffer()}>Request edit buffer</button>
          <button onClick={() => monitor.clear()}>Clear</button>
        </div>

        <div className="diagnosis">
          {!anyIn ? (
            <p className="warn">
              Nothing received yet. Turn a knob on the synth — if that appears here but sysex does
              not, the problem is the instrument's sysex settings, not the connection.
            </p>
          ) : sysexIn === 0 ? (
            <p className="warn">
              Parameter messages are arriving but <strong>no sysex has ever been received</strong>.
              On the Prophet, check <code>Globals → MIDI SysEx</code>: it must be set to{' '}
              <code>MIDI</code> when connected over 5-pin DIN, and <code>USB</code> only when
              connected by USB cable. It is separate from the MIDI Out setting, so parameter
              changes work either way.
            </p>
          ) : (
            <p className="ok">
              SysEx is flowing. Device ID 0x{midi.deviceId.toString(16)}
              {connection.deviceIdConfirmed ? ' (confirmed by the synth)' : ' (assumed)'}.
            </p>
          )}
        </div>
      </div>

      <div className="monitor-list">
        <table>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={e.direction}>
                <td className="dir" title={DIRECTION_TITLE[e.direction]}>
                {DIRECTION_GLYPH[e.direction]}
              </td>
                <td className="kind">{e.kind}</td>
                <td className="summary">{e.summary}</td>
                <td className="bytes">{e.bytes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <p className="empty">No traffic yet.</p>}
      </div>
    </aside>
  )
}
