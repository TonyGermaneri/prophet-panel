/**
 * The header's patch stepper walks this list, so its edge behaviour is what matters: the ends, an
 * empty library, nothing selected yet, and a filtered order.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { initPatch } from '../../domain/patch'
import { entryFromPatch, type LibraryEntry } from '../db'
import { library } from '../libraryStore'

function seed(names: string[]): LibraryEntry[] {
  const patch = initPatch()
  return names.map((name, i) =>
    entryFromPatch({ ...patch, name, program: i }, 'Bank', 'factory', `id-${i}`),
  )
}

/** The store loads from IndexedDB; these tests drive its contents and order directly instead. */
function install(entries: LibraryEntry[]) {
  const internals = library as unknown as {
    byId: Map<string, LibraryEntry>
    order: string[]
    selectedId: string | null
  }
  internals.byId = new Map(entries.map((e) => [e.id, e]))
  internals.order = entries.map((e) => e.id)
  internals.selectedId = null
}

describe('stepping through the library', () => {
  beforeEach(() => install(seed(['A', 'B', 'C'])))

  it('starts at the first entry when stepping forward with nothing selected', () => {
    expect(library.step(1)?.name).toBe('A')
  })

  it('starts at the last entry when stepping back with nothing selected', () => {
    expect(library.step(-1)?.name).toBe('C')
  })

  it('moves one at a time in either direction', () => {
    library.select('id-1')
    expect(library.step(1)?.name).toBe('C')
    expect(library.step(-1)?.name).toBe('A')
  })

  it('stops at the ends rather than wrapping', () => {
    library.select('id-2')
    expect(library.step(1)).toBeNull()
    expect(library.canStep(1)).toBe(false)
    library.select('id-0')
    expect(library.step(-1)).toBeNull()
    expect(library.canStep(-1)).toBe(false)
  })

  it('treats any magnitude as a single step, so a stray delta cannot skip patches', () => {
    library.select('id-0')
    expect(library.step(5)?.name).toBe('B')
  })

  it('does nothing on an empty library', () => {
    install([])
    expect(library.step(1)).toBeNull()
    expect(library.canStep(1)).toBe(false)
    expect(library.canStep(-1)).toBe(false)
  })

  it('follows a narrowed order, so stepping stays inside a filtered view', () => {
    library.setOrder(['id-0', 'id-2'])
    library.select('id-0')
    // 'B' is filtered out, so forward lands on 'C'.
    expect(library.step(1)?.name).toBe('C')
    library.select('id-2')
    expect(library.step(1)).toBeNull()
  })

  it('reports position for the stepper’s enabled state', () => {
    library.select('id-1')
    expect(library.position).toEqual({ index: 1, total: 3 })
  })
})
