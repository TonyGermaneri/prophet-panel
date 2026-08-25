/**
 * The panel, wired to the host's automation lanes.
 *
 * Every control is a lane, declared by the native side at startup, so nothing has to be bound by
 * hand — a lane is simply there for each control, whether or not anyone ever draws on it. Two of
 * them belong to this program rather than to the synthesizer: patch + and patch −, which walk the
 * library the way the buttons beside the patch number do.
 *
 * A no-op in the browser, which has no host.
 */

import { platform } from '@platform'

import { BY_ID } from '../domain/parameters'
import { stepPatch } from '../library/actions'
import { store } from './store'

/** The two the instrument knows nothing about, and which way each one walks. */
const TRIGGERS: Record<string, number> = { patchNext: 1, patchPrev: -1 }

export function attachAutomation(): () => void {
  const automation = platform.automation
  if (automation === undefined) return () => {}

  // What each trigger was last seen at, so a step happens on the way up rather than continuously
  // while a lane sits at the top.
  const triggerHeldAt = new Map<string, number>()

  const fromHost = automation.onChange((id, value) => {
    const delta = TRIGGERS[id]

    if (delta !== undefined) {
      const previous = triggerHeldAt.get(id) ?? 0
      triggerHeldAt.set(id, value)
      if (previous <= 0 && value > 0) stepPatch(delta)
      return
    }

    // Source 'ui': as far as the instrument is concerned this is someone turning the knob, and the
    // change has to reach the synth rather than only the drawing of it. The store ignores a set to
    // the value it already holds, which is what stops this echoing back out through the line below.
    store.set(id, value, 'ui')
  })

  // BY_ID is a Map; Object.keys of one is empty, and silently so.
  const toHost = [...BY_ID.keys()].map((id) =>
    store.subscribe(id, (value) => automation.set(id, value)),
  )

  return () => {
    fromHost()
    for (const off of toHost) off()
  }
}
