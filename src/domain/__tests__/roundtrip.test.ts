/**
 * The codec is proved against the real factory corpus before any hardware is involved: every one
 * of the 123 .syx files in patches/factory/ must decode and re-encode byte-for-byte, and the name
 * embedded in each file must match the name in its filename.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseSyxFile, readName, setParam, toProgramData, toSyxFile } from '../patch'
import {
  DEFAULT_DEVICE_ID,
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

const allFiles = walk(FACTORY_DIR)
const singles = allFiles.filter((f) => f.includes('P5_Factory-'))
const banks = allFiles.filter((f) => !f.includes('P5_Factory-'))

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
  it('found the expected number of files', () => {
    expect(singles.length).toBe(120)
    expect(banks.length).toBe(3)
  })

  it.each(singles.map((f) => [f.slice(FACTORY_DIR.length + 1), f]))(
    'round-trips %s byte-for-byte',
    (_label, file) => {
      const original = new Uint8Array(readFileSync(file))
      const patches = parseSyxFile(original)
      expect(patches).toHaveLength(1)
      expect(Array.from(toProgramData(patches[0], original[2]))).toEqual(Array.from(original))
    },
  )

  it.each(banks.map((f) => [f.slice(FACTORY_DIR.length + 1), f]))(
    'round-trips bank %s byte-for-byte',
    (_label, file) => {
      const original = new Uint8Array(readFileSync(file))
      const patches = parseSyxFile(original)
      expect(patches).toHaveLength(40)
      expect(Array.from(toSyxFile(patches, original[2]))).toEqual(Array.from(original))
    },
  )

  it('embedded names match filenames', () => {
    for (const file of singles) {
      // Filenames look like "P5_Factory-G5-2-5_TRUMPET_FLUTE.syx" — the name runs from the first
      // underscore after the slot to the extension, and may itself contain underscores.
      const name = /G5-\d-\d_(.+)\.syx$/.exec(file)![1]
      const patch = parseSyxFile(new Uint8Array(readFileSync(file)))[0]
      // The name field is 20 characters, so a longer source name is truncated.
      expect(patch.name).toBe(name.trim().slice(0, 20).trimEnd())
    }
  })

  it('group and program match the filename slot', () => {
    for (const file of singles) {
      const match = /G5-(\d)-(\d)_/.exec(file)!
      const patch = parseSyxFile(new Uint8Array(readFileSync(file)))[0]
      expect(patch.group).toBe(4)
      expect(patch.program).toBe((Number(match[1]) - 1) * 8 + Number(match[2]) - 1)
    }
  })

  it('every file uses a device ID from the known family', () => {
    for (const file of allFiles) {
      const id = readFileSync(file)[2]
      expect(isKnownDeviceId(id)).toBe(true)
      expect(id).toBe(DEFAULT_DEVICE_ID)
    }
  })

  it('decodes plausible values for a known patch', () => {
    const brass = singles.find((f) => f.endsWith('G5-1-1_BRASS.syx'))!
    const patch = parseSyxFile(new Uint8Array(readFileSync(brass)))[0]
    const get = (id: string) => patch.payload[PARAMETERS.find((p) => p.id === id)!.nrpn]

    expect(patch.name).toBe('BRASS')
    expect(get('oscASaw')).toBe(1)
    expect(get('mixOscA')).toBe(120)
    expect(get('mixOscB')).toBe(120)
    // Classic brass: filter closed, opened entirely by a strong envelope.
    expect(get('filterCutoff')).toBe(0)
    expect(get('filterEnvAmount')).toBe(91)
    expect(get('filterKeyboardTrack')).toBe(2)
  })

  it('stores switch parameters as strictly 0 or 1', () => {
    // A stronger check than a range assertion: if the offset table were misaligned by even one
    // byte, switches would pick up pot values and this would fail immediately.
    for (const file of allFiles) {
      for (const message of splitSysex(new Uint8Array(readFileSync(file)))) {
        const decoded = decodeMessage(message)
        if (decoded?.kind !== 'programData') continue
        for (const p of STORED_PARAMETERS) {
          if (p.type !== 'switch') continue
          const value = decoded.payload[p.offset!]
          expect(value, `${file}: ${p.id} = ${value}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('stores every parameter as a legal 7-bit value', () => {
    // Note the corpus is not strictly inside the documented pot range: one patch in Set2 has
    // ampSustain = 121 against a documented max of 120. The panel clamps on write, but loading
    // must not mangle a value the hardware itself accepts.
    for (const file of allFiles) {
      for (const message of splitSysex(new Uint8Array(readFileSync(file)))) {
        const decoded = decodeMessage(message)
        if (decoded?.kind !== 'programData') continue
        for (const p of STORED_PARAMETERS) {
          const value = decoded.payload[p.offset!]
          expect(value, `${file}: ${p.id} = ${value}`).toBeLessThan(128)
        }
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
    const original = new Uint8Array(readFileSync(singles[0]))
    const retargeted = retargetDeviceId(original, 0x33)
    expect(retargeted[2]).toBe(0x33)
    expect(parseSyxFile(retargeted)[0].name).toBe(readName(parseSyxFile(original)[0].payload))
    expect(Array.from(retargeted.subarray(3))).toEqual(Array.from(original.subarray(3)))
  })
})
