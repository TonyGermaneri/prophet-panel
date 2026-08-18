import { useSyncExternalStore } from 'react'

import { sharedLibraries } from '../library/shared'
import { sources } from '../library/sources'

/** Re-renders when a shared library finishes loading, fails, or its collections change. */
export function useShared(): typeof sharedLibraries {
  useSyncExternalStore(
    (fn) => sharedLibraries.subscribe(fn),
    () => sharedLibraries.revision,
    () => sharedLibraries.revision,
  )
  return sharedLibraries
}

/** Re-renders when a source is added, removed, renamed or enabled. */
export function useSources(): typeof sources {
  useSyncExternalStore(
    (fn) => sources.subscribe(fn),
    () => sources.all,
    () => sources.all,
  )
  return sources
}
