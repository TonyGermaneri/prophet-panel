import { describeSource } from '../midi/bindings'
import { controlDisplayName } from '../panel/layout'
import { useBindings } from './useBindings'
import { useMidiStatus } from './useMidi'

export function BindingsPanel({ onClose }: { onClose: () => void }) {
  const bind = useBindings()
  const midi = useMidiStatus()

  const synthPort = midi.inputs.find((p) => p.id === midi.inputId)
  const others = midi.inputs.filter((p) => p.id !== midi.inputId)

  return (
    <aside className="bindings">
      <div className="library-head">
        <h2>MIDI Bindings</h2>
        <button className="icon" onClick={onClose} aria-label="Close bindings">
          ×
        </button>
      </div>

      <div className="library-actions">
        <ol className="steps">
          <li className={bind.selected ? 'done' : 'active'}>Click a knob or switch on the panel</li>
          <li className={bind.selected ? 'active' : ''}>Move a control on your MIDI controller</li>
        </ol>

        {bind.selected ? (
          <p className="listening">
            Listening for <strong>{controlDisplayName(bind.selected)}</strong> — move a control now.
            <button className="link" onClick={() => bind.select(null)}>
              Cancel
            </button>
          </p>
        ) : bind.lastBound ? (
          <p className="captured">
            Bound <strong>{controlDisplayName(bind.lastBound.controlId)}</strong> to{' '}
            {describeSource(bind.lastBound.source)}.
          </p>
        ) : null}

        {!others.length && (
          <p className="hint">
            No controller inputs besides {synthPort ? synthPort.name : 'the synth'}, which is
            excluded from learning so its own knobs cannot be captured. Connect a controller to
            bind.
          </p>
        )}

        {bind.bindings.length > 0 && (
          <div className="row">
            <button className="link danger" onClick={() => bind.clear()}>
              Clear all bindings
            </button>
          </div>
        )}
      </div>

      <div className="library-list">
        <ul className="binding-list">
          {bind.bindings.map((b) => (
            <li key={b.controlId}>
              <span className="binding-control">{controlDisplayName(b.controlId)}</span>
              <span className="binding-source">
                {describeSource(b.source)}
                <em>{b.portName}</em>
              </span>
              <button className="link danger" onClick={() => bind.remove(b.controlId)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        {!bind.bindings.length && <p className="empty">No bindings yet.</p>}
      </div>
    </aside>
  )
}
