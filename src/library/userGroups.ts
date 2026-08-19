/**
 * User groups: named folders of the user's own patches.
 *
 * The library's other views are addressed by slot — ten groups of forty, exactly the instrument's
 * program memory. That is the wrong shape for patches someone is still working on, which arrive as
 * arbitrary files, come from anywhere, and want to be filed by what they are rather than by which
 * of the 400 slots they happen to name. A user group is that filing: a name, a little authorship,
 * and whichever patches were put in it.
 *
 * A group that came out of a zip carries `bundle`, which is what turns it into its own tab named
 * after the file it arrived in. Re-importing the same filename replaces that bundle's groups rather
 * than stacking a second copy beside them, so an updated zip is just an import away.
 *
 * The list lives in the library database's `meta` store rather than a store of its own: it is a
 * handful of small records, always read whole, and keeping it there means no schema version bump
 * and so no migration for a database that already holds someone's patches.
 */

import { getMeta, setMeta } from './db'

const KEY = 'user-groups'

/** Where an imported group came from. `file` is the zip's name, which names the tab. */
export interface BundleOrigin {
  file: string
  importedAt: number
  /** The bundle's own name, description and author, as its manifest gave them. */
  name?: string
  description?: string
  author?: string
}

export interface UserGroup {
  id: string
  name: string
  description?: string
  author?: string
  createdAt: number
  updatedAt: number
  /** Set when the group arrived in a zip; absent for groups the user made here. */
  bundle?: BundleOrigin
}

/** Every group from one imported zip, which together make up one tab. */
export interface BundleView {
  /** The zip's filename, used as both the tab's key and its label. */
  file: string
  importedAt: number
  origin: BundleOrigin
  groups: UserGroup[]
}

function isGroup(value: unknown): value is UserGroup {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as UserGroup).id === 'string' &&
    typeof (value as UserGroup).name === 'string'
  )
}

class UserGroupStore {
  private value: UserGroup[] = []
  private listeners = new Set<() => void>()
  private loading: Promise<void> | null = null

  get all(): UserGroup[] {
    return this.value
  }

  /** Groups the user made here, which is what the User tab shows. */
  get own(): UserGroup[] {
    return this.value.filter((g) => !g.bundle)
  }

  /** One view per imported zip, newest first, each becoming a tab of its own. */
  get bundles(): BundleView[] {
    const byFile = new Map<string, BundleView>()
    for (const group of this.value) {
      if (!group.bundle) continue
      const view = byFile.get(group.bundle.file)
      if (view) {
        view.groups.push(group)
      } else {
        byFile.set(group.bundle.file, {
          file: group.bundle.file,
          importedAt: group.bundle.importedAt,
          origin: group.bundle,
          groups: [group],
        })
      }
    }
    return [...byFile.values()].sort((a, b) => b.importedAt - a.importedAt)
  }

  group(id: string): UserGroup | undefined {
    return this.value.find((g) => g.id === id)
  }

  async load(): Promise<void> {
    // Shared in flight, since startup and React's development double-effect both call this.
    this.loading ??= (async () => {
      const stored = await getMeta<unknown>(KEY)
      this.value = Array.isArray(stored) ? stored.filter(isGroup) : []
      this.changed()
    })()
    return this.loading
  }

  async create(init: Partial<UserGroup> & { name: string }): Promise<UserGroup> {
    const now = Date.now()
    const group: UserGroup = {
      description: undefined,
      author: undefined,
      ...init,
      id: init.id ?? crypto.randomUUID(),
      name: init.name.trim() || 'Untitled Group',
      createdAt: init.createdAt ?? now,
      updatedAt: now,
    }
    await this.write([...this.value, group])
    return group
  }

  async update(id: string, patch: Partial<UserGroup>): Promise<void> {
    await this.write(
      this.value.map((g) => (g.id === id ? { ...g, ...patch, id: g.id, updatedAt: Date.now() } : g)),
    )
  }

  async remove(ids: string[]): Promise<void> {
    const drop = new Set(ids)
    await this.write(this.value.filter((g) => !drop.has(g.id)))
  }

  /** Add a bundle's groups, replacing any earlier import of the same filename. */
  async replaceBundle(file: string, groups: UserGroup[]): Promise<UserGroup[]> {
    await this.write([...this.value.filter((g) => g.bundle?.file !== file), ...groups])
    return groups
  }

  private async write(next: UserGroup[]): Promise<void> {
    this.value = next
    this.changed()
    await setMeta(KEY, next)
  }

  private changed(): void {
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const userGroups = new UserGroupStore()
