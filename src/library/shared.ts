/**
 * Loading shared libraries into memory.
 *
 * Shared patches are deliberately never written to IndexedDB. They belong to whoever published
 * them, so they are fetched fresh each load, live only in this store, and are excluded from the
 * export scopes — a shared collection is something to audition and copy from, not part of the
 * user's own library until they say so. Selecting one sends the sound to the synth's edit buffer
 * and nothing more; no shared patch can overwrite a program on the instrument.
 */

import { type Patch, parseSyxFile } from '../domain/patch'
import { type LibraryEntry } from './db'
import { library } from './libraryStore'
import { fetchManifest, resolveFile, type SharedManifest } from './manifest'
import { type LibrarySource, sources } from './sources'

export type SourceState = 'idle' | 'loading' | 'ready' | 'error'

export interface SourceStatus {
  state: SourceState
  /** Set when the manifest itself could not be read; the source contributes no tabs. */
  error?: string
  /** Set when the manifest loaded but some of the files it names did not. */
  warning?: string
  manifest?: SharedManifest
  patches: number
}

/** One tab in the library. */
export interface SharedCollectionView {
  key: string
  sourceId: string
  sourceLabel: string
  id: string
  name: string
  description?: string
  entries: LibraryEntry[]
}

function fileLabel(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.syx$/i, '')
}

function toEntry(
  patch: Patch,
  bank: string,
  id: string,
  collectionKey: string,
): LibraryEntry {
  return {
    id,
    name: patch.name || 'UNTITLED',
    group: patch.group,
    program: patch.program,
    payload: patch.payload,
    source: 'shared',
    bank,
    collectionKey,
    updatedAt: 0,
  }
}

class SharedLibraries {
  private statuses = new Map<string, SourceStatus>()
  private views: SharedCollectionView[] = []
  private listeners = new Set<() => void>()
  private version = 0
  private runs = new Map<string, AbortController>()

  get revision(): number {
    return this.version
  }

  get collections(): SharedCollectionView[] {
    return this.views
  }

  collection(key: string): SharedCollectionView | undefined {
    return this.views.find((c) => c.key === key)
  }

  status(sourceId: string): SourceStatus {
    return this.statuses.get(sourceId) ?? { state: 'idle', patches: 0 }
  }

  /** Read every enabled source. Sources load independently, so one bad URL costs only its own tabs. */
  async loadAll(): Promise<void> {
    await Promise.all(sources.active.map((s) => this.load(s)))
  }

  async load(source: LibrarySource): Promise<void> {
    // A source reloaded while its previous read is still running would otherwise race, and the
    // slower of the two would win.
    this.runs.get(source.id)?.abort()
    const run = new AbortController()
    this.runs.set(source.id, run)

    this.setStatus(source.id, { state: 'loading', patches: 0 })
    try {
      const manifest = await fetchManifest(source.base, run.signal)
      if (run.signal.aborted) return

      const views: SharedCollectionView[] = []
      let missing = 0
      let patches = 0

      for (const collection of manifest.collections) {
        const key = `${source.id}:${collection.id}`
        const entries: LibraryEntry[] = []
        for (const [i, file] of collection.files.entries()) {
          let bytes: Uint8Array
          try {
            const response = await fetch(resolveFile(source.base, file), { signal: run.signal })
            if (!response.ok) throw new Error(String(response.status))
            bytes = new Uint8Array(await response.arrayBuffer())
          } catch (error) {
            if (run.signal.aborted) return
            missing++
            continue
          }
          parseSyxFile(bytes).forEach((patch, j) => {
            entries.push(toEntry(patch, fileLabel(file), `shared:${key}:${i}:${j}`, key))
          })
        }
        patches += entries.length
        // A collection whose files all failed would be an empty tab that explains nothing; the
        // count of missing files is reported on the source instead.
        if (entries.length) {
          views.push({
            key,
            sourceId: source.id,
            sourceLabel: manifest.name || source.label,
            id: collection.id,
            name: collection.name,
            description: collection.description,
            entries,
          })
        }
      }

      if (run.signal.aborted) return
      this.replace(source.id, views)
      this.setStatus(source.id, {
        state: 'ready',
        manifest,
        patches,
        warning: missing ? `${missing} file${missing === 1 ? '' : 's'} could not be read` : undefined,
      })
    } catch (error) {
      if (run.signal.aborted) return
      this.replace(source.id, [])
      this.setStatus(source.id, {
        state: 'error',
        patches: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Drop a source's collections without touching anything else's. */
  forget(sourceId: string): void {
    this.runs.get(sourceId)?.abort()
    this.runs.delete(sourceId)
    this.statuses.delete(sourceId)
    this.replace(sourceId, [])
  }

  private replace(sourceId: string, views: SharedCollectionView[]): void {
    this.views = [...this.views.filter((c) => c.sourceId !== sourceId), ...views]
    library.setShared(this.views.flatMap((c) => c.entries))
    this.changed()
  }

  private setStatus(sourceId: string, status: SourceStatus): void {
    this.statuses.set(sourceId, status)
    this.changed()
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

export const sharedLibraries = new SharedLibraries()
