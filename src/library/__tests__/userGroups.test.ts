/**
 * User groups and the tabs they become.
 *
 * The behaviour worth pinning is bundle identity: an imported zip is addressed by its filename, so
 * importing an updated copy has to replace what the last one left rather than stack a second tab
 * beside it. Everything else here is bookkeeping, but that one rule is what makes "publish, then
 * re-import" a workable way to keep a shared bundle up to date.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => {
  const meta = new Map<string, unknown>()
  return {
    getMeta: async (key: string) => meta.get(key),
    setMeta: async (key: string, value: unknown) => void meta.set(key, value),
    __meta: meta,
  }
})

const { userGroups } = await import('../userGroups')
const { __meta } = (await import('../db')) as unknown as { __meta: Map<string, unknown> }

const bundle = (file: string, importedAt: number) => ({ file, importedAt })

beforeEach(async () => {
  __meta.clear()
  // The store is a module singleton; reloading from the now-empty meta store resets it.
  ;(userGroups as unknown as { loading: Promise<void> | null }).loading = null
  await userGroups.load()
})

describe('groups the user makes', () => {
  it('creates a group with a trimmed name and its own timestamps', async () => {
    const group = await userGroups.create({ name: '  Pads  ', author: 'Tony Germaneri' })
    expect(group.name).toBe('Pads')
    expect(group.author).toBe('Tony Germaneri')
    expect(group.createdAt).toBeGreaterThan(0)
    expect(userGroups.own).toEqual([group])
  })

  it('falls back to a placeholder rather than an unnamed folder', async () => {
    expect((await userGroups.create({ name: '   ' })).name).toBe('Untitled Group')
  })

  it('keeps the id when a group is renamed', async () => {
    const group = await userGroups.create({ name: 'Pads' })
    await userGroups.update(group.id, { name: 'Warm Pads', id: 'something-else' })
    expect(userGroups.group(group.id)?.name).toBe('Warm Pads')
    expect(userGroups.all).toHaveLength(1)
  })

  it('survives a reload', async () => {
    await userGroups.create({ name: 'Pads', description: 'Soft ones' })
    ;(userGroups as unknown as { loading: Promise<void> | null }).loading = null
    await userGroups.load()
    expect(userGroups.own.map((g) => g.description)).toEqual(['Soft ones'])
  })

  it('ignores anything in storage that is not a group', async () => {
    __meta.set('user-groups', [{ name: 'no id' }, 7, null, { id: 'a', name: 'Real' }])
    ;(userGroups as unknown as { loading: Promise<void> | null }).loading = null
    await userGroups.load()
    expect(userGroups.all.map((g) => g.name)).toEqual(['Real'])
  })
})

describe('imported bundles', () => {
  const groupsFrom = (file: string, at: number, names: string[]) =>
    names.map((name, i) => ({
      id: `${file}-${i}`,
      name,
      createdAt: at + i,
      updatedAt: at,
      bundle: bundle(file, at),
    }))

  it('gathers the groups from one zip into one tab, and keeps them out of the User tab', async () => {
    await userGroups.create({ name: 'Mine' })
    await userGroups.replaceBundle('Pads', groupsFrom('Pads', 1000, ['Warm', 'Cold']))

    expect(userGroups.own.map((g) => g.name)).toEqual(['Mine'])
    expect(userGroups.bundles).toHaveLength(1)
    expect(userGroups.bundles[0].file).toBe('Pads')
    expect(userGroups.bundles[0].groups.map((g) => g.name)).toEqual(['Warm', 'Cold'])
  })

  it('replaces an earlier import of the same filename instead of doubling it', async () => {
    await userGroups.replaceBundle('Pads', groupsFrom('Pads', 1000, ['Warm', 'Cold']))
    await userGroups.replaceBundle('Pads', groupsFrom('Pads', 2000, ['Warm', 'Cold', 'Newer']))

    expect(userGroups.bundles).toHaveLength(1)
    expect(userGroups.bundles[0].groups.map((g) => g.name)).toEqual(['Warm', 'Cold', 'Newer'])
    expect(userGroups.all.filter((g) => g.bundle)).toHaveLength(3)
  })

  it('keeps other bundles untouched, newest tab first', async () => {
    await userGroups.replaceBundle('Pads', groupsFrom('Pads', 1000, ['Warm']))
    await userGroups.replaceBundle('Leads', groupsFrom('Leads', 3000, ['Sharp']))
    await userGroups.replaceBundle('Pads', groupsFrom('Pads', 2000, ['Warm']))

    expect(userGroups.bundles.map((b) => b.file)).toEqual(['Leads', 'Pads'])
  })

  it('deletes a whole bundle when its groups go', async () => {
    const groups = groupsFrom('Pads', 1000, ['Warm', 'Cold'])
    await userGroups.replaceBundle('Pads', groups)
    await userGroups.remove(groups.map((g) => g.id))
    expect(userGroups.bundles).toEqual([])
  })
})
