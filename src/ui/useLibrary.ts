import { useSyncExternalStore } from 'react'

import { library } from '../library/libraryStore'

/** Re-renders when the library's contents, order or selection change. */
export function useLibrary(): typeof library {
  useSyncExternalStore(
    (fn) => library.subscribe(fn),
    () => library.revision,
    () => library.revision,
  )
  return library
}
