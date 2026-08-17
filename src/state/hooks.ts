import { useCallback, useSyncExternalStore } from 'react'

import { store } from './store'

/** Subscribe a single control to its own parameter, so a drag re-renders only that control. */
export function useParam(id: string): [number, (value: number) => void] {
  const subscribe = useCallback((fn: () => void) => store.subscribe(id, fn), [id])
  const value = useSyncExternalStore(
    subscribe,
    () => store.get(id),
    () => store.get(id),
  )
  const set = useCallback((next: number) => store.set(id, next, 'ui'), [id])
  return [value, set]
}

/** Patch name, group and program, which change together rather than per-parameter. */
export function usePatchMeta(): { name: string; group: number; program: number } {
  return useSyncExternalStore(
    (fn) => store.subscribeMeta(fn),
    () => metaSnapshot(),
    () => metaSnapshot(),
  )
}

let cachedMeta = { name: '', group: -1, program: -1 }
function metaSnapshot() {
  if (
    cachedMeta.name !== store.name ||
    cachedMeta.group !== store.group ||
    cachedMeta.program !== store.program
  ) {
    cachedMeta = { name: store.name, group: store.group, program: store.program }
  }
  return cachedMeta
}
