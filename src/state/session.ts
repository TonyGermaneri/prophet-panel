/**
 * The panel's patch, kept with the host's session.
 *
 * In the browser this is meaningless — the page's own lifetime is the session, and a reload starts
 * again. In a plugin it is not: the editor is destroyed every time the user closes the window, so
 * without this, closing the panel would throw away whatever sound was on it.
 *
 * The 133-byte payload is the whole of what needs keeping. Everything else the panel shows —
 * settings, bindings, the library — already persists on its own.
 */

import { platform } from '@platform'

import { BY_ID } from '../domain/parameters'
import { patchFromPayload } from '../domain/patch'
import { store } from './store'

/** Long enough that a knob drag saves once rather than once per frame. */
const SETTLE_MS = 250

export function attachSession(): () => void {
  const session = platform.session
  if (session === undefined) return () => {}

  const saved = session.get()
  // The slot is kept, not restored from the payload: the payload is an edit buffer and carries no
  // trustworthy slot of its own.
  if (saved) store.loadPatch(patchFromPayload(saved, store.group, store.program))

  let timer: ReturnType<typeof setTimeout> | null = null

  const push = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      session.set(store.snapshot().payload)
    }, SETTLE_MS)
  }

  // Every parameter, plus name and slot. The store notifies per control rather than globally, so
  // there is no single change event to listen to instead.
  //
  // BY_ID is a Map, and Object.keys of a Map is the empty array — which type-checks perfectly and
  // subscribed this to nothing at all, so a patch was only ever saved when its name or slot
  // changed. Moving a knob did not count as changing the sound.
  const detach = [
    store.subscribeMeta(push),
    ...[...BY_ID.keys()].map((id) => store.subscribe(id, push)),
  ]

  return () => {
    if (timer !== null) clearTimeout(timer)
    for (const off of detach) off()
  }
}
