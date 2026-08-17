/**
 * The library's contents and the current position within it.
 *
 * This lives outside the library panel because the header's patch stepper walks the same list, and
 * the panel is unmounted most of the time. Seeding and loading therefore happen at startup rather
 * than when the panel is first opened.
 *
 * `order` is the sequence the stepper follows. The panel keeps it in step with what it is actually
 * showing, so stepping with a search filter active stays inside the filtered results rather than
 * jumping to a patch that is not on screen.
 */

import { allEntries, type LibraryEntry } from './db'
import { seedFactoryPatches } from './factory'

class LibraryStore {
  private byId = new Map<string, LibraryEntry>()
  private order: string[] = []
  private listeners = new Set<() => void>()
  private version = 0

  selectedId: string | null = null

  get revision(): number {
    return this.version
  }

  get entries(): LibraryEntry[] {
    return this.order.map((id) => this.byId.get(id)!).filter(Boolean)
  }

  get all(): LibraryEntry[] {
    return [...this.byId.values()]
  }

  entry(id: string): LibraryEntry | undefined {
    return this.byId.get(id)
  }

  /** The patch occupying a slot, if any. The header refuses to show a number with nothing behind it. */
  entryAtSlot(group: number, program: number): LibraryEntry | undefined {
    for (const entry of this.byId.values()) {
      if (entry.group === group && entry.program === program) return entry
    }
    return undefined
  }

  /** Where the selection sits in the current order, for enabling the stepper's ends. */
  get position(): { index: number; total: number } {
    return {
      index: this.selectedId ? this.order.indexOf(this.selectedId) : -1,
      total: this.order.length,
    }
  }

  async init(): Promise<void> {
    await seedFactoryPatches()
    await this.refresh()
  }

  async refresh(): Promise<void> {
    const list = await allEntries()
    this.byId = new Map(list.map((e) => [e.id, e]))
    // Default order is the canonical one; the panel narrows it when a filter is active.
    this.order = list.map((e) => e.id)
    this.changed()
  }

  setOrder(ids: string[]): void {
    if (ids.length === this.order.length && ids.every((id, i) => id === this.order[i])) return
    this.order = ids
    this.changed()
  }

  select(id: string | null): void {
    if (this.selectedId === id) return
    this.selectedId = id
    this.changed()
  }

  /**
   * The entry `delta` places away, or null at the ends. With nothing selected yet, stepping forward
   * starts at the first entry and stepping back at the last.
   */
  step(delta: number): LibraryEntry | null {
    if (!this.order.length) return null
    const current = this.position.index
    const next =
      current < 0 ? (delta > 0 ? 0 : this.order.length - 1) : current + Math.sign(delta)
    if (next < 0 || next >= this.order.length) return null
    return this.byId.get(this.order[next]) ?? null
  }

  canStep(delta: number): boolean {
    return this.step(delta) !== null
  }

  private changed(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const library = new LibraryStore()
