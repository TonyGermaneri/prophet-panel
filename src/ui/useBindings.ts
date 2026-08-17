import { useSyncExternalStore } from 'react'

import { bindings } from '../midi/bindings'
import { settings, type Settings } from '../state/settings'

/** Re-renders whenever a binding is added, removed, or the bind mode/selection changes. */
export function useBindings(): typeof bindings {
  useSyncExternalStore(
    (fn) => bindings.subscribe(fn),
    () => bindings.revision,
    () => bindings.revision,
  )
  return bindings
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (fn) => settings.subscribe(fn),
    () => settings.current,
    () => settings.current,
  )
}
