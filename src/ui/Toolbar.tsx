import { bankOf, programInBank } from '../domain/patch'
import { stepPatch } from '../library/actions'
import { usePatchMeta } from '../state/hooks'
import { settings } from '../state/settings'
import { store } from '../state/store'
import { BookIcon, GearIcon, LinkIcon, PianoIcon } from './icons'
import { useBindings, useSettings } from './useBindings'
import { useLibrary } from './useLibrary'
import { useMidiStatus } from './useMidi'

export function Toolbar({
  onToggleLibrary,
  onToggleMonitor,
  onOpenControlPanel,
}: {
  onToggleLibrary: () => void
  onToggleMonitor: () => void
  onOpenControlPanel: () => void
}) {
  const midi = useMidiStatus()
  const meta = usePatchMeta()
  const prefs = useSettings()
  const bind = useBindings()
  const library = useLibrary()

  const ready = midi.state === 'ready'

  return (
    <header className="toolbar">
      <div className="toolbar-group patch-id">
        {/* Steps through the library, not the instrument's own program memory. */}
        <button
          className="stepper"
          onClick={() => stepPatch(-1)}
          disabled={!library.canStep(-1)}
          title="Previous patch in the library"
          aria-label="Previous patch in the library"
        >
          −
        </button>
        <span className="slot">
          {meta.group + 1}
          {bankOf(meta.program)}
          {programInBank(meta.program)}
        </span>
        <button
          className="stepper"
          onClick={() => stepPatch(1)}
          disabled={!library.canStep(1)}
          title="Next patch in the library"
          aria-label="Next patch in the library"
        >
          +
        </button>
        <input
          className="patch-name"
          value={meta.name}
          maxLength={20}
          spellCheck={false}
          onChange={(e) => store.setName(e.target.value)}
          aria-label="Patch name"
        />
      </div>

      <div className="toolbar-group toolbar-icons">
        {/* Connection state is the one thing worth seeing without opening anything; clicking it
            goes straight to where it can be changed. */}
        <button
          className="icon-button status-button"
          onClick={onOpenControlPanel}
          title={
            midi.device
              ? `${midi.device.model} · OS ${midi.device.version}`
              : ready
                ? 'MIDI connected'
                : 'MIDI not connected'
          }
        >
          <span className={`dot ${ready ? 'on' : ''}`} />
        </button>

        <button
          className={prefs.hideKeyboard ? 'icon-button' : 'icon-button active'}
          onClick={() => settings.update({ hideKeyboard: !prefs.hideKeyboard })}
          aria-pressed={!prefs.hideKeyboard}
          title={prefs.hideKeyboard ? 'Show keyboard' : 'Hide keyboard'}
          aria-label={prefs.hideKeyboard ? 'Show keyboard' : 'Hide keyboard'}
        >
          <PianoIcon />
        </button>

        <button
          className={bind.active ? 'icon-button active' : 'icon-button'}
          onClick={() => bind.setActive(!bind.active)}
          aria-pressed={bind.active}
          title="MIDI Bind — learn a controller to a panel control"
          aria-label="MIDI Bind"
        >
          <LinkIcon />
        </button>

        <button
          className="icon-button"
          onClick={onToggleLibrary}
          title="Patch library"
          aria-label="Patch library"
        >
          <BookIcon />
        </button>

        <button
          className="icon-button"
          onClick={onToggleMonitor}
          title="MIDI monitor"
          aria-label="MIDI monitor"
        >
          {/* A monitor shows traffic, so the glyph is a trace. */}
          <svg
            className="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            focusable={false}
          >
            <path d="M3 15.5h3l2.2-7 2.6 10 2.4-8.5 1.8 5.5H21" />
          </svg>
        </button>

        <button
          className="icon-button"
          onClick={onOpenControlPanel}
          title="Control panel"
          aria-label="Control panel"
        >
          <GearIcon />
        </button>
      </div>
    </header>
  )
}
