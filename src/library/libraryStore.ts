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
import { userGroups } from './userGroups'

/**
 * The order a user group holds its patches in: as added, oldest first.
 *
 * Grouped patches have no meaningful slot to sort by — a group is a folder of arbitrary files, and
 * two of them naming program 1A1 is normal — so the sequence they were filed in is the only order
 * that stays put. It is also the order a bundle writes them in, which is what lets a group's
 * per-patch metadata survive the round trip through a zip.
 */
export function groupOrder(entries: LibraryEntry[]): LibraryEntry[] {
  return [...entries].sort(
    (a, b) =>
      (a.meta?.createdAt ?? a.updatedAt) - (b.meta?.createdAt ?? b.updatedAt) ||
      a.name.localeCompare(b.name),
  )
}

class LibraryStore {
  private byId = new Map<string, LibraryEntry>()
  private sharedById = new Map<string, LibraryEntry>()
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

  /**
   * Patches addressed by slot rather than filed into a user group. This is what "My Patches" shows:
   * a grouped patch has a tab of its own, and listing it in both would only invite deleting it from
   * the place that looks like a copy.
   */
  get ungrouped(): LibraryEntry[] {
    return this.all.filter((e) => !e.groupId)
  }

  /** One user group's patches, in the order the group holds them. */
  inGroup(groupId: string): LibraryEntry[] {
    return groupOrder(this.all.filter((e) => e.groupId === groupId))
  }

  /**
   * Patches from shared repositories. Kept apart from `all` on purpose: they are not the user's to
   * export or delete, so every scope that means "my library" keeps meaning that.
   */
  get shared(): LibraryEntry[] {
    return [...this.sharedById.values()]
  }

  entry(id: string): LibraryEntry | undefined {
    return this.byId.get(id) ?? this.sharedById.get(id)
  }

  /** Replaces every shared entry at once, since a reload re-reads whole sources. */
  setShared(entries: LibraryEntry[]): void {
    this.sharedById = new Map(entries.map((e) => [e.id, e]))
    this.changed()
  }

  /** The patch occupying a slot in the user's own library. Shared patches are not in any slot. */
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
    await userGroups.load()
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
