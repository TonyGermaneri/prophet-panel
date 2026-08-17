/**
 * Selecting a patch, from wherever. The library panel and the header's stepper both go through
 * here so a patch always arrives the same way: onto the panel, into the slot, and out to the synth.
 */

import { sync } from '../midi'
import { store } from '../state/store'
import { patchFromEntry, type LibraryEntry } from './db'
import { library } from './libraryStore'

export function auditionEntry(entry: LibraryEntry): void {
  const patch = patchFromEntry(entry)
  library.select(entry.id)
  store.loadPatch(patch)
  store.setSlot(entry.group, entry.program)
  sync.sendEditBuffer(patch)
}

/** Walk the library by one, in whatever order the library panel is currently showing. */
export function stepPatch(delta: number): void {
  const next = library.step(delta)
  if (next) auditionEntry(next)
}
