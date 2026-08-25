import { useEffect, useRef, useState } from 'react'

import { platform } from '@platform'

import { documentTitle } from './domain/model'
import {
  bankOf,
  nextGroupInHalf,
  PROGRAMS_PER_GROUP,
  toggleFactoryGroup,
} from './domain/patch'
import { LibraryPanel } from './library/LibraryPanel'
import { library } from './library/libraryStore'
import { sharedLibraries } from './library/shared'
import { connection, sync } from './midi'
import { bindings } from './midi/bindings'
import { splitMessages } from './midi/forward'
import { monitor } from './midi/monitor'
import { Panel } from './panel/Panel'
import { registerActions } from './state/actions'
import { attachSession } from './state/session'
import { notes } from './state/notes'
import { settings } from './state/settings'
import { store } from './state/store'
import { BindingsPanel } from './ui/BindingsPanel'
import { ControlPanelDialog } from './ui/ControlPanelDialog'
import { MonitorPanel } from './ui/MonitorPanel'
import { ResizeGrip } from './ui/ResizeGrip'
import { Toolbar } from './ui/Toolbar'
import { useBindings, useSettings } from './ui/useBindings'
import { useComputerKeyboard } from './ui/useComputerKeyboard'
import { useFitWindow } from './ui/useFitWindow'
import './App.css'

/** Move to a slot; selectProgram sends the change and then pulls the synth's edit buffer back. */
function goTo(group: number, program: number): void {
  store.setSlot(group, program)
  sync.selectProgram(group, program)
}

export function App() {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [monitorOpen, setMonitorOpen] = useState(false)
  const [controlPanelOpen, setControlPanelOpen] = useState(false)
  const prefs = useSettings()
  const bind = useBindings()
  const { octave, velocity } = useComputerKeyboard(true)
  const stageRef = useRef<HTMLElement>(null)

  // The instrument sets the height of the window it is shown in. Which instrument that is depends
  // on both of these: the keyboard toggle picks the panel, and the model picks the badge on it.
  useFitWindow(stageRef, `${prefs.hideKeyboard}:${prefs.model}`)

  // The tab and the installed app's window both name the instrument that is showing.
  useEffect(() => {
    document.title = documentTitle(prefs.model)
  }, [prefs.model])

  useEffect(() => {
    sync.follow = settings.current.follow
    sync.start()

    // Seed and load at startup rather than when the library panel first opens, because the
    // header's patch stepper walks the same list and the panel is usually not mounted.
    void library.init()

    // Shared libraries are re-read every load rather than cached, so a repository that gains a
    // collection shows it without anyone having to refresh anything by hand.
    void sharedLibraries.loadAll()

    // Reconnect without being asked. Chrome remembers the sysex grant per origin, so once access
    // has been given a reload can restore the connection silently; without the flag we would be
    // firing a permission prompt at someone who has never opted in.
    // The gate is about the browser's sysex permission prompt: firing one at someone who has never
    // opted in would be a surprise. A plugin has no prompt to fire, so it simply connects.
    if (platform.name === 'plugin' || settings.current.hasConnected) {
      void connection.connect().then((state) => {
        if (state === 'ready') void connection.identify()
      })
    }
    monitor.attach(connection)

    // In a plugin the editor dies whenever the window is closed, so the panel's current sound is
    // handed to the host with the rest of the session. A no-op in the browser.
    const detachSession = attachSession()

    // Everything from the performance controller lands here. Bindings get first refusal, since an
    // automation message should drive its panel control rather than reaching the synth twice;
    // whatever no binding claims is passed through as performance data.
    const unbindPorts = connection.onPortMessage((portId, portName, data) => {
      if (portId !== connection.controllerInput?.id) return
      // Per message, not per buffer: one event can carry several, and judging them all by the
      // first would forward a bound knob's traffic to the synth because something else led.
      for (const message of splitMessages(data)) {
        if (bindings.handle(portId, portName, message) === 'ignored') {
          connection.forwardToSynth(message)
        }
      }
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
      bankSelect: () => goTo(store.group, (store.program + 8) % PROGRAMS_PER_GROUP),
      // GROUP SELECT counts 1-5 and wraps, exactly as the instrument's display does; reaching the
      // other five groups is FACTORY's job, not a sixth press. Counting 1-10 here would leave the
      // panel a group ahead of the hardware.
      groupSelect: () => goTo(nextGroupInHalf(store.group), store.program),
      factory: () => goTo(toggleFactoryGroup(store.group), store.program),
      record: () => sync.writeProgram(store.snapshot()),
    })

    return () => {
      unregister()
      detachSession()
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
        onOpenControlPanel={() => setControlPanelOpen(true)}
      />
      <div className="body">
        <main className="stage" ref={stageRef}>
          {libraryOpen && prefs.libraryDock === 'header' && (
            <LibraryPanel onClose={() => setLibraryOpen(false)} />
          )}
          <Panel compact={prefs.hideKeyboard} />
          <p className="keyboard-hint">
            Play with <kbd>A</kbd>–<kbd>K</kbd> and <kbd>W</kbd>–<kbd>U</kbd> · <kbd>Z</kbd>/
            <kbd>X</kbd> octave {octave} · <kbd>C</kbd>/<kbd>V</kbd> velocity {velocity}
          </p>
        </main>
        {bind.active && <BindingsPanel onClose={() => bind.setActive(false)} />}
        {monitorOpen && <MonitorPanel onClose={() => setMonitorOpen(false)} />}
        {libraryOpen && prefs.libraryDock === 'aside' && (
          <LibraryPanel onClose={() => setLibraryOpen(false)} />
        )}
      </div>
      {controlPanelOpen && <ControlPanelDialog onClose={() => setControlPanelOpen(false)} />}
      <ResizeGrip />
    </div>
  )
}
