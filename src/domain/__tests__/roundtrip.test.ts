/**
 * The codec is proved against the real corpus before any hardware is involved: every program in
 * patches/factory/ must decode and re-encode byte-for-byte.
 *
 * That corpus is the Prophet-10's own memory — all ten groups, 400 programs, captured from the
 * instrument itself — so this exercises real device output rather than a third-party conversion.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseSyxFile, readName, setParam, toSyxFile } from '../patch'
import {
  decodeMessage,
  isKnownDeviceId,
  pack,
  retargetDeviceId,
  splitSysex,
  unpack,
} from '../sysex'
import { BY_NRPN, PARAMETERS, param, STORED_PARAMETERS, UNISON_NOTE_RANGE } from '../parameters'

const FACTORY_DIR = join(process.cwd(), 'patches', 'factory')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.syx') ? [full] : []
  })
}

const banks = walk(FACTORY_DIR)

describe('packed MS-bit format', () => {
  it('pack and unpack are inverses', () => {
    const data = new Uint8Array(133)
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i % 5) * 91) & 0xff
    expect(Array.from(unpack(pack(data)))).toEqual(Array.from(data))
  })

  it('packs 133 bytes into the 152 the spec calls for', () => {
    expect(pack(new Uint8Array(133)).length).toBe(152)
  })

  it('never emits a byte with the high bit set', () => {
    const data = new Uint8Array(133).fill(0xff)
    expect(Array.from(pack(data)).every((b) => b < 0x80)).toBe(true)
  })
})

describe('factory corpus', () => {
  const programs = banks.flatMap((file) =>
    splitSysex(new Uint8Array(readFileSync(file))).map((m) => decodeMessage(m)),
  )

  it('is the full instrument: ten groups of forty', () => {
    expect(banks).toHaveLength(10)
    expect(programs).toHaveLength(400)
    const perGroup = new Map<number, number>()
    for (const p of programs) {
      if (p?.kind !== 'programData') continue
      perGroup.set(p.group, (perGroup.get(p.group) ?? 0) + 1)
    }
    expect([...perGroup.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect([...perGroup.values()].every((n) => n === 40)).toBe(true)
  })

  it.each(banks.map((f) => [f.slice(FACTORY_DIR.length + 1), f]))(
    'round-trips %s byte-for-byte',
    (_label, file) => {
      const original = new Uint8Array(readFileSync(file))
      const patches = parseSyxFile(original)
      expect(patches).toHaveLength(40)
      expect(Array.from(toSyxFile(patches, original[2]))).toEqual(Array.from(original))
    },
  )

  it('carries the device ID this Prophet-10 transmits', () => {
    for (const file of banks) expect(readFileSync(file)[2]).toBe(0x33)
    expect(isKnownDeviceId(0x33)).toBe(true)
  })

  it('every program has a printable name', () => {
    for (const p of programs) {
      if (p?.kind !== 'programData') continue
      const name = readName(p.payload)
      expect(name.length, JSON.stringify(name)).toBeGreaterThan(0)
      expect(/^[\x20-\x7e]+$/.test(name), JSON.stringify(name)).toBe(true)
    }
  })

  it('stores switch parameters as strictly 0 or 1', () => {
    // A stronger check than a range assertion: if the offset table were misaligned by even one
    // byte, switches would pick up pot values and this would fail immediately.
    for (const p of programs) {
      if (p?.kind !== 'programData') continue
      for (const param of STORED_PARAMETERS) {
        if (param.type !== 'switch') continue
        expect(p.payload[param.offset!], param.id).toBeLessThanOrEqual(1)
      }
    }
  })

  it('stores every parameter as a legal 7-bit value', () => {
    for (const p of programs) {
      if (p?.kind !== 'programData') continue
      for (const param of STORED_PARAMETERS) {
        expect(p.payload[param.offset!], param.id).toBeLessThan(128)
      }
    }
  })
})

describe('parameter table', () => {
  it('has no duplicate NRPN numbers or ids', () => {
    expect(new Set(PARAMETERS.map((p) => p.nrpn)).size).toBe(PARAMETERS.length)
    expect(new Set(PARAMETERS.map((p) => p.id)).size).toBe(PARAMETERS.length)
    expect(BY_NRPN.size).toBe(PARAMETERS.length)
  })

  it('keeps every stored parameter inside the 128-byte program', () => {
    for (const p of STORED_PARAMETERS) expect(p.offset!).toBeLessThan(128)
  })

  it('never stores a parameter over the name or unison-note fields', () => {
    for (const p of STORED_PARAMETERS) {
      const o = p.offset!
      expect(o < UNISON_NOTE_RANGE.start, `${p.id} at byte ${o} overlaps reserved bytes`).toBe(true)
    }
  })

  it('gives no byte offset to parameters whose position is unconfirmed', () => {
    // NRPN 80 (layer select) would land inside the name field if offsets were assumed to equal
    // NRPN numbers, which is exactly the bug this separation prevents.
    for (const id of ['layerSelect', 'pitchWheelRange', 'retriggerUnison', 'biTimbralMode']) {
      expect(param(id).offset, `${id} should be control-only`).toBeUndefined()
    }
  })

  it('leaves control-only parameters untouched by setParam', () => {
    const payload = new Uint8Array(133).fill(9)
    setParam(payload, param('layerSelect'), 1)
    expect(Array.from(payload)).toEqual(Array.from(new Uint8Array(133).fill(9)))
  })
})

describe('device retargeting', () => {
  it('rewrites the device ID without disturbing the payload', () => {
    const original = splitSysex(new Uint8Array(readFileSync(banks[0])))[0]
    const retargeted = retargetDeviceId(original, 0x33)
    expect(retargeted[2]).toBe(0x33)
    expect(parseSyxFile(retargeted)[0].name).toBe(readName(parseSyxFile(original)[0].payload))
    expect(Array.from(retargeted.subarray(3))).toEqual(Array.from(original.subarray(3)))
  })
})
