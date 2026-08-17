import { useEffect, useState } from 'react'

import { bankOf } from './domain/patch'
import { LibraryPanel } from './library/LibraryPanel'
import { connection, sync } from './midi'
import { bindings } from './midi/bindings'
import { monitor } from './midi/monitor'
import { Panel } from './panel/Panel'
import { registerActions } from './state/actions'
import { notes } from './state/notes'
import { settings } from './state/settings'
import { store } from './state/store'
import { BindingsPanel } from './ui/BindingsPanel'
import { MonitorPanel } from './ui/MonitorPanel'
import { Toolbar } from './ui/Toolbar'
import { useBindings, useSettings } from './ui/useBindings'
import { useComputerKeyboard } from './ui/useComputerKeyboard'
import './App.css'

/** Move to a slot; selectProgram sends the change and then pulls the synth's edit buffer back. */
function goTo(group: number, program: number): void {
  store.setSlot(group, program)
  sync.selectProgram(group, program)
}

export function App() {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [monitorOpen, setMonitorOpen] = useState(false)
  const prefs = useSettings()
  const bind = useBindings()
  const { octave, velocity } = useComputerKeyboard(true)

  useEffect(() => {
    sync.follow = settings.current.follow
    sync.start()
    monitor.attach(connection)

    // MIDI learn and binding playback listen to every input except the synth's own, so reaching
    // for a controller cannot capture whatever the Prophet happens to be transmitting.
    const unbindPorts = connection.onPortMessage((portId, portName, data) => {
      bindings.handle(portId, portName, data, connection.input?.id ?? null)
    })

    const unregister = registerActions({
      // Program buttons pick one of eight within the current bank; bank and group step onward
      // and wrap, matching how the buttons behave on the instrument.
      ...Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `program${i + 1}`,
          () => goTo(store.group, (bankOf(store.program) - 1) * 8 + i),
        ]),
      ),
      bankSelect: () => goTo(store.group, (store.program + 8) % 40),
      groupSelect: () => goTo((store.group + 1) % 10, store.program),
      record: () => sync.writeProgram(store.snapshot()),
    })

    return () => {
      unregister()
      unbindPorts()
      monitor.detach()
      notes.allOff()
      sync.stop()
    }
  }, [])

  return (
    <div className="app">
      <Toolbar
        onToggleLibrary={() => setLibraryOpen((v) => !v)}
        onToggleMonitor={() => setMonitorOpen((v) => !v)}
      />
      <div className="body">
        <main className="stage">
          <Panel compact={prefs.hideKeyboard} />
          <p className="keyboard-hint">
            Play with <kbd>A</kbd>–<kbd>K</kbd> and <kbd>W</kbd>–<kbd>U</kbd> · <kbd>Z</kbd>/
            <kbd>X</kbd> octave {octave} · <kbd>C</kbd>/<kbd>V</kbd> velocity {velocity}
          </p>
        </main>
        {bind.active && <BindingsPanel onClose={() => bind.setActive(false)} />}
        {monitorOpen && <MonitorPanel onClose={() => setMonitorOpen(false)} />}
        {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
      </div>
    </div>
  )
}
