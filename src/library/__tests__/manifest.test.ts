/**
 * Resolving and validating shared-library manifests.
 *
 * A manifest is content from someone else's repository, so the file-reference rules are treated as
 * a boundary rather than a formatting preference: the tests below pin the cases where a manifest
 * would otherwise get this app to fetch something the user never pointed it at.
 */

import { describe, expect, it } from 'vitest'

import { fromIsoDate, parseManifest, resolveFile, resolveSource, toIsoDate } from '../manifest'

const RAW = 'https://raw.githubusercontent.com/TonyGermaneri/prophet-panel/'

describe('resolveSource', () => {
  it('resolves a GitHub browse URL to the raw directory', () => {
    expect(
      resolveSource('https://github.com/TonyGermaneri/prophet-panel/tree/main/patches/factory').base,
    ).toBe(`${RAW}main/patches/factory/`)
  })

  it('resolves a link to the manifest itself, since that is what people copy', () => {
    expect(
      resolveSource(
        'https://github.com/TonyGermaneri/prophet-panel/blob/main/patches/factory/manifest.json',
      ).base,
    ).toBe(`${RAW}main/patches/factory/`)
  })

  it('takes a raw URL as given', () => {
    expect(resolveSource(`${RAW}main/patches/factory/`).base).toBe(`${RAW}main/patches/factory/`)
    expect(resolveSource(`${RAW}main/patches/factory`).base).toBe(`${RAW}main/patches/factory/`)
  })

  it('uses HEAD when the URL names no branch, rather than guessing at "main"', () => {
    expect(resolveSource('https://github.com/TonyGermaneri/prophet-panel').base).toBe(`${RAW}HEAD/`)
    expect(resolveSource('TonyGermaneri/prophet-panel/patches').base).toBe(`${RAW}HEAD/patches/`)
  })

  it('accepts a plain web directory, so this is not GitHub-only', () => {
    expect(resolveSource('https://example.com/sounds').base).toBe('https://example.com/sounds/')
  })

  it('always ends at a directory', () => {
    for (const input of [
      'https://github.com/a/b/tree/main/x',
      'https://raw.githubusercontent.com/a/b/main/x',
      'https://example.com/x',
      'a/b/x',
    ]) {
      expect(resolveSource(input).base.endsWith('/')).toBe(true)
    }
  })

  it('rejects input that is not a location at all', () => {
    expect(() => resolveSource('')).toThrow('Enter a repository URL')
    expect(() => resolveSource('some patches please')).toThrow('Not a repository URL')
  })
})

describe('resolveFile', () => {
  const base = `${RAW}main/patches/factory/`

  it('resolves a name inside the directory', () => {
    expect(resolveFile(base, 'Group 1.syx')).toBe(`${base}Group%201.syx`)
    expect(resolveFile(base, 'extra/Group 1.syx')).toBe(`${base}extra/Group%201.syx`)
  })

  it('refuses to climb out of the source directory', () => {
    for (const path of ['../secrets.syx', 'a/../../b.syx', '/etc/passwd']) {
      expect(() => resolveFile(base, path)).toThrow('inside its own directory')
    }
  })

  it('refuses to address another host', () => {
    for (const path of [
      'https://evil.example/patch.syx',
      '//evil.example/patch.syx',
      'HTTPS://evil.example/patch.syx',
      'data:text/plain,x',
    ]) {
      expect(() => resolveFile(base, path)).toThrow('inside its own directory')
    }
  })

  it('rejects an empty name', () => {
    expect(() => resolveFile(base, '  ')).toThrow('empty filename')
  })
})

describe('parseManifest', () => {
  const good = {
    version: 1,
    name: 'Prophet-10 Factory',
    collections: [{ id: 'a', name: 'Groups 1-5', files: ['Group 1.syx'] }],
  }

  it('accepts a well-formed manifest', () => {
    const manifest = parseManifest(good)
    expect(manifest.name).toBe('Prophet-10 Factory')
    expect(manifest.collections[0].files).toEqual(['Group 1.syx'])
  })

  it('names collections that omit an id, so a tab is still addressable', () => {
    const manifest = parseManifest({ ...good, collections: [{ name: 'X', files: ['a.syx'] }] })
    expect(manifest.collections[0].id).toBe('collection-1')
  })

  it('rejects a version it cannot read rather than guessing', () => {
    expect(() => parseManifest({ ...good, version: 2 })).toThrow('not supported')
    expect(() => parseManifest({ ...good, version: undefined })).toThrow('not supported')
  })

  it('rejects manifests with nothing to show', () => {
    expect(() => parseManifest({ ...good, collections: [] })).toThrow('no collections')
    expect(() => parseManifest({ ...good, name: '' })).toThrow('name is missing')
    expect(() => parseManifest({ ...good, collections: [{ name: 'X', files: [] }] })).toThrow(
      'no files',
    )
  })

  it('rejects things that are not manifests', () => {
    for (const value of [null, 'text', 42, []]) {
      expect(() => parseManifest(value)).toThrow()
    }
  })
})

describe('patch metadata', () => {
  const base = {
    version: 1,
    name: 'Pads',
    collections: [{ id: 'pads', name: 'Pads', files: ['Pads.syx'] }],
  }

  it('reads authorship off a collection', () => {
    const manifest = parseManifest({
      ...base,
      createdAt: '2026-08-19T00:00:00.000Z',
      collections: [
        {
          ...base.collections[0],
          author: 'Tony Germaneri',
          createdAt: '2026-08-01T00:00:00.000Z',
          patches: [
            {
              index: 2,
              name: 'GLASS',
              author: 'Tony Germaneri',
              description: 'Bell-like',
              tags: ['pad', 'bright'],
              createdAt: '2026-07-04T00:00:00.000Z',
            },
          ],
        },
      ],
    })
    expect(manifest.createdAt).toBe('2026-08-19T00:00:00.000Z')
    expect(manifest.collections[0].author).toBe('Tony Germaneri')
    expect(manifest.collections[0].patches).toEqual([
      {
        index: 2,
        name: 'GLASS',
        author: 'Tony Germaneri',
        description: 'Bell-like',
        tags: ['pad', 'bright'],
        createdAt: '2026-07-04T00:00:00.000Z',
      },
    ])
  })

  it('drops malformed bylines rather than rejecting the manifest they are in', () => {
    const manifest = parseManifest({
      ...base,
      collections: [
        {
          ...base.collections[0],
          patches: [
            'not an object',
            { index: -1, author: 'Nobody' },
            { index: 1.5, author: 'Nobody' },
            { author: 'Nobody' },
            { index: 0, author: 'Tony', tags: ['pad', 7, '  '] },
          ],
        },
      ],
    })
    expect(manifest.collections[0].patches).toEqual([{ index: 0, author: 'Tony', tags: ['pad'] }])
  })

  it('treats an absent patch list as absent, not as an empty one', () => {
    expect(parseManifest(base).collections[0].patches).toBeUndefined()
    expect(parseManifest({ ...base, collections: [{ ...base.collections[0], patches: [] }] })
      .collections[0].patches).toBeUndefined()
  })

  it('round-trips dates through the ISO form a manifest carries', () => {
    const ms = Date.UTC(2026, 7, 19, 12, 30)
    expect(fromIsoDate(toIsoDate(ms))).toBe(ms)
    expect(toIsoDate(undefined)).toBeUndefined()
    expect(fromIsoDate('not a date')).toBeUndefined()
    expect(fromIsoDate('   ')).toBeUndefined()
  })
})
