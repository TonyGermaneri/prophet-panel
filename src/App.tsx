import { useEffect, useState } from 'react'

import { LibraryPanel } from './library/LibraryPanel'
import { sync } from './midi'
import { Panel } from './panel/Panel'
import { Toolbar } from './ui/Toolbar'
import './App.css'

export function App() {
  const [libraryOpen, setLibraryOpen] = useState(false)

  useEffect(() => {
    sync.start()
    return () => sync.stop()
  }, [])

  return (
    <div className={libraryOpen ? 'app library-open' : 'app'}>
      <Toolbar onToggleLibrary={() => setLibraryOpen((v) => !v)} />
      <div className="body">
        <main className="stage">
          <Panel />
        </main>
        {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
      </div>
    </div>
  )
}
