/**
 * The list of shared libraries the user has subscribed to.
 *
 * Only the subscription is persisted, never the patches it yields. Manifests are re-read on every
 * load so a repository that gains a collection shows it without the user doing anything, and so a
 * library nobody controls locally cannot go stale in a store we would then have to invalidate.
 */

const KEY = 'prophet-panel:library-sources'

export interface LibrarySource {
  id: string
  /** Exactly what the user typed, so the settings row shows them something they recognise. */
  url: string
  /** The resolved directory the manifest lives in, with a trailing slash. */
  base: string
  label: string
  enabled: boolean
  addedAt: number
}

function read(): LibrarySource[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is LibrarySource =>
        !!s && typeof s === 'object' && typeof (s as LibrarySource).base === 'string',
    )
  } catch {
    return []
  }
}

class SourceStore {
  private value: LibrarySource[] = read()
  private listeners = new Set<() => void>()

  get all(): LibrarySource[] {
    return this.value
  }

  get active(): LibrarySource[] {
    return this.value.filter((s) => s.enabled)
  }

  has(base: string): boolean {
    return this.value.some((s) => s.base === base)
  }

  add(source: Omit<LibrarySource, 'id' | 'addedAt' | 'enabled'>): LibrarySource {
    const entry: LibrarySource = {
      ...source,
      id: crypto.randomUUID(),
      enabled: true,
      addedAt: Date.now(),
    }
    this.write([...this.value, entry])
    return entry
  }

  update(id: string, patch: Partial<LibrarySource>): void {
    this.write(this.value.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  remove(id: string): void {
    this.write(this.value.filter((s) => s.id !== id))
  }

  private write(next: LibrarySource[]): void {
    this.value = next
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Private browsing and full quotas both throw; the list still applies for this session.
    }
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const sources = new SourceStore()
