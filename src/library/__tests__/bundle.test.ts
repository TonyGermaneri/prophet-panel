/**
 * Patch bundles.
 *
 * The property that matters is that the two sharing routes stay one format: a bundle exported here
 * must be readable as a shared repository directory, and a folder of .syx files someone zipped up
 * by hand must still import. Both are checked against real factory data rather than synthetic
 * payloads, so a change to the sysex codec cannot pass this suite while breaking sharing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseSyxFile } from '../../domain/patch'
import { buildBundle, readBundle } from '../bundle'
import { entryFromPatch, type LibraryEntry } from '../db'
import { parseManifest } from '../manifest'
import { readZip, writeZip } from '../zip'

const DEVICE_ID = 0x33
const ROOT = join(__dirname, '..', '..', '..', 'patches', 'factory')

function factoryEntries(group: number, bank: string): LibraryEntry[] {
  const file = join(ROOT, `Prophet-10 Factory Group ${String(group).padStart(2, '0')}.syx`)
  return parseSyxFile(new Uint8Array(readFileSync(file))).map((p) => entryFromPatch(p, bank))
}

const options = { name: 'Test Bundle', author: 'Tony Germaneri', deviceId: DEVICE_ID }

describe('buildBundle', () => {
  it('writes a manifest a shared source would accept', async () => {
    const zip = buildBundle(factoryEntries(1, 'Factory Group 1'), options)
    const files = await readZip(zip)
    const manifest = parseManifest(
      JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json')!.data)),
    )
    expect(manifest.name).toBe('Test Bundle')
    expect(manifest.author).toBe('Tony Germaneri')
    expect(manifest.collections).toEqual([
      { id: 'factory-group-1', name: 'Factory Group 1', files: ['Factory Group 1.syx'] },
    ])
  })

  it('gives every bank its own file and its own collection', async () => {
    const zip = buildBundle(
      [...factoryEntries(1, 'Factory Group 1'), ...factoryEntries(2, 'Factory Group 2')],
      options,
    )
    const files = await readZip(zip)
    expect(files.map((f) => f.name)).toEqual([
      'manifest.json',
      'Factory Group 1.syx',
      'Factory Group 2.syx',
    ])
    // Forty program-data messages of 159 bytes each, exactly as the instrument dumps them.
    expect(files[1].data.length).toBe(40 * 159)
  })

  it('keeps banks apart when their names clean to the same filename', async () => {
    const entries = [
      ...factoryEntries(1, 'Live: Pads'),
      ...factoryEntries(2, 'Live/Pads'),
    ]
    const files = await readZip(buildBundle(entries, options))
    const names = files.filter((f) => f.name.endsWith('.syx')).map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('orders programs by slot, so a bundle reads like the instrument', async () => {
    const shuffled = [...factoryEntries(1, 'Group')].reverse()
    const files = await readZip(buildBundle(shuffled, options))
    const patches = parseSyxFile(files[1].data)
    expect(patches.map((p) => p.program)).toEqual(patches.map((_, i) => i))
  })
})

describe('readBundle', () => {
  it('round-trips patches byte for byte', async () => {
    const source = factoryEntries(3, 'Factory Group 3')
    const { entries, manifest } = await readBundle(buildBundle(source, options))
    expect(manifest?.name).toBe('Test Bundle')
    expect(entries.length).toBe(source.length)
    for (const [i, entry] of entries.entries()) {
      expect(entry.name).toBe(source[i].name)
      expect(entry.group).toBe(source[i].group)
      expect(entry.program).toBe(source[i].program)
      expect(entry.payload).toEqual(source[i].payload)
    }
  })

  it('takes bank names from the manifest', async () => {
    const { entries } = await readBundle(buildBundle(factoryEntries(4, 'Session One'), options))
    expect(new Set(entries.map((e) => e.bank))).toEqual(new Set(['Session One']))
  })

  it('marks everything as imported, never as factory content', async () => {
    const { entries } = await readBundle(buildBundle(factoryEntries(5, 'Anything'), options))
    expect(entries.every((e) => e.source === 'import')).toBe(true)
  })

  it('accepts a plain folder of .syx files with no manifest', async () => {
    const raw = readFileSync(join(ROOT, 'Prophet-10 Factory Group 06.syx'))
    const { entries, manifest } = await readBundle(
      writeZip([{ name: 'sounds/My Best Patches.syx', data: new Uint8Array(raw) }]),
    )
    expect(manifest).toBeUndefined()
    expect(entries.length).toBe(40)
    expect(entries[0].bank).toBe('My Best Patches')
  })

  it('reads a bundle zipped by a third-party tool', async () => {
    const { entries, manifest } = await readBundle(
      new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'third-party.zip'))),
    )
    expect(manifest?.name).toBe('Fixture Bundle')
    expect(entries.length).toBe(80)
    expect(new Set(entries.map((e) => e.bank))).toEqual(new Set(['First Ten', 'Second Ten']))
  })

  it('ignores the resource forks macOS puts in a zip', async () => {
    const raw = new Uint8Array(readFileSync(join(ROOT, 'Prophet-10 Factory Group 07.syx')))
    const { entries } = await readBundle(
      writeZip([
        { name: 'Group.syx', data: raw },
        { name: '__MACOSX/._Group.syx', data: new Uint8Array([0, 5, 22, 7]) },
      ]),
    )
    expect(entries.length).toBe(40)
  })

  it('reports files that held no patches instead of dropping them silently', async () => {
    const { entries, skipped } = await readBundle(
      writeZip([{ name: 'notes.syx', data: new TextEncoder().encode('not sysex') }]),
    )
    expect(entries).toEqual([])
    expect(skipped).toEqual(['notes.syx'])
  })

  it('still yields patches when the manifest is unreadable', async () => {
    const raw = new Uint8Array(readFileSync(join(ROOT, 'Prophet-10 Factory Group 08.syx')))
    const { entries, manifest } = await readBundle(
      writeZip([
        { name: 'manifest.json', data: new TextEncoder().encode('{ broken') },
        { name: 'Group 8.syx', data: raw },
      ]),
    )
    expect(manifest).toBeUndefined()
    expect(entries.length).toBe(40)
    expect(entries[0].bank).toBe('Group 8')
  })
})
