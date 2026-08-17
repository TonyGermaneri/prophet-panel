/**
 * Held notes, shared by the mouse and the computer keyboard so both light the same keys and both
 * reach the synth through one path.
 */

import { performance } from './performance'

class NoteStore {
  private heldNotes = new Set<number>()
  private snapshotCache: ReadonlySet<number> = new Set()
  private listeners = new Set<() => void>()

  get held(): ReadonlySet<number> {
    return this.snapshotCache
  }

  noteOn(note: number, velocity = 100): void {
    if (this.heldNotes.has(note)) return
    this.heldNotes.add(note)
    this.publish()
    performance.noteOn(note, velocity)
  }

  noteOff(note: number): void {
    if (!this.heldNotes.delete(note)) return
    this.publish()
    performance.noteOff(note)
  }

  allOff(): void {
    for (const note of [...this.heldNotes]) this.noteOff(note)
  }

  private publish(): void {
    // useSyncExternalStore compares snapshots by identity, so hand out a new set each change.
    this.snapshotCache = new Set(this.heldNotes)
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const notes = new NoteStore()
