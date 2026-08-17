/**
 * The patch model.
 *
 * A patch is just its 133-byte unpacked sysex payload plus the slot it came from. Keeping the raw
 * bytes as the source of truth — rather than a struct of named fields — is what makes editing
 * lossless: bytes the panel never touches (unison note assignments, the bi-timbral layer bytes,
 * anything a future OS adds) survive a load/edit/save round trip untouched.
 */

import {
  NAME_LENGTH,
  NAME_OFFSET,
  type Parameter,
  PARAMETERS,
  UNISON_NOTE_RANGE,
} from './parameters'
import {
  decodeMessage,
  encodeEditBuffer,
  encodeProgramData,
  PAYLOAD_SIZE,
  splitSysex,
} from './sysex'

export interface Patch {
  name: string
  /** Group 0-9 (displayed as 1-10). */
  group: number
  /** Program 0-39, i.e. five banks of eight. */
  program: number
  payload: Uint8Array
}

export function clamp(value: number, p: Parameter): number {
  return Math.max(p.min, Math.min(p.max, Math.round(value)))
}

/**
 * Read a parameter out of a program. Parameters whose byte position is unconfirmed are not stored
 * in the payload at all, so they report their minimum.
 */
export function getParam(payload: Uint8Array, p: Parameter): number {
  return p.offset === undefined ? p.min : (payload[p.offset] ?? p.min)
}

/** Write a parameter into a program. A no-op for control-only parameters, by design. */
export function setParam(payload: Uint8Array, p: Parameter, value: number): void {
  if (p.offset === undefined) return
  payload[p.offset] = clamp(value, p)
}

export function readName(payload: Uint8Array): string {
  let name = ''
  for (let i = NAME_OFFSET; i < NAME_OFFSET + NAME_LENGTH; i++) {
    const c = payload[i]
    if (c === 0) break
    name += String.fromCharCode(c)
  }
  return name.trimEnd()
}

export function writeName(payload: Uint8Array, name: string): void {
  const text = name.toUpperCase().slice(0, NAME_LENGTH).padEnd(NAME_LENGTH, ' ')
  for (let i = 0; i < NAME_LENGTH; i++) {
    const code = text.charCodeAt(i)
    payload[NAME_OFFSET + i] = code >= 32 && code < 127 ? code : 32
  }
}

/** Banks are eight programs each; program 0-39 maps to bank 1-5, program 1-8. */
export function bankOf(program: number): number {
  return Math.floor(program / 8) + 1
}
export function programInBank(program: number): number {
  return (program % 8) + 1
}
export function slotLabel(group: number, program: number): string {
  return `${group + 1}${bankOf(program)}${programInBank(program)}`
}

export function emptyPayload(): Uint8Array {
  const payload = new Uint8Array(PAYLOAD_SIZE)
  // Unison note assignments default to 127 in the factory patches; match that rather than
  // leaving zeros, which the synth reads as note assignments of C-2.
  payload.fill(127, UNISON_NOTE_RANGE.start, UNISON_NOTE_RANGE.end + 1)
  writeName(payload, 'INIT PROGRAM')
  return payload
}

/** A playable default: single saw oscillator, open filter, simple amp envelope. */
export function initPatch(): Patch {
  const payload = emptyPayload()
  const set = (id: string, value: number) => {
    const p = PARAMETERS.find((x) => x.id === id)
    if (p) setParam(payload, p, value)
  }
  set('oscASaw', 1)
  set('mixOscA', 120)
  set('filterCutoff', 120)
  set('filterKeyboardTrack', 2)
  set('ampSustain', 120)
  set('ampRelease', 20)
  set('vintage', 0)
  set('releaseSwitch', 1)
  set('pitchWheelRange', 2)
  return { name: readName(payload), group: 0, program: 0, payload }
}

export function patchFromPayload(payload: Uint8Array, group = 0, program = 0): Patch {
  const full = new Uint8Array(PAYLOAD_SIZE)
  full.set(payload.subarray(0, PAYLOAD_SIZE))
  return { name: readName(full), group, program, payload: full }
}

export function clonePatch(patch: Patch): Patch {
  return { ...patch, payload: patch.payload.slice() }
}

export function toProgramData(patch: Patch, deviceId: number): Uint8Array {
  return encodeProgramData(deviceId, patch.group, patch.program, patch.payload)
}

export function toEditBuffer(patch: Patch, deviceId: number): Uint8Array {
  return encodeEditBuffer(deviceId, patch.payload)
}

/**
 * Parse a .syx file. Handles both a single program and a concatenated bank (the factory bank
 * files are simply 40 program-data messages back to back).
 */
export function parseSyxFile(bytes: Uint8Array): Patch[] {
  const patches: Patch[] = []
  for (const message of splitSysex(bytes)) {
    const decoded = decodeMessage(message)
    if (!decoded) continue
    if (decoded.kind === 'programData') {
      patches.push(patchFromPayload(decoded.payload, decoded.group, decoded.program))
    } else if (decoded.kind === 'editBuffer') {
      patches.push(patchFromPayload(decoded.payload))
    }
  }
  return patches
}

/** Serialize patches back to a .syx file, one program-data message each. */
export function toSyxFile(patches: Patch[], deviceId: number): Uint8Array {
  const messages = patches.map((p) => toProgramData(p, deviceId))
  const total = messages.reduce((n, m) => n + m.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const m of messages) {
    out.set(m, offset)
    offset += m.length
  }
  return out
}
