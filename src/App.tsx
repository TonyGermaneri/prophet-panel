import { useEffect, useState } from 'react'

import { bankOf } from './domain/patch'
import { LibraryPanel } from './library/LibraryPanel'
import { connection, sync } from './midi'
import { monitor } from './midi/monitor'
import { Panel } from './panel/Panel'
import { registerActions } from './state/actions'
import { store } from './state/store'
import { MonitorPanel } from './ui/MonitorPanel'
import { Toolbar } from './ui/Toolbar'
import './App.css'

/** Move to a slot, then ask the synth to follow. */
function goTo(group: number, program: number): void {
  store.setSlot(group, program)
  sync.selectProgram(group, program)
  sync.requestEditBuffer()
}

export function App() {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [monitorOpen, setMonitorOpen] = useState(false)

  useEffect(() => {
    sync.start()
    monitor.attach(connection)
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
      monitor.detach()
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
          <Panel />
        </main>
        {monitorOpen && <MonitorPanel onClose={() => setMonitorOpen(false)} />}
        {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
      </div>
    </div>
  )
}
