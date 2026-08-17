/**
 * A rolling log of MIDI traffic in both directions.
 *
 * This exists to answer questions the panel alone cannot: whether a request actually went out,
 * whether the synth answered, and whether sysex is reaching us at all. When sysex is disabled on
 * the instrument the symptom is silence, and silence is indistinguishable from a bug without this.
 */

import { BY_NRPN } from '../domain/parameters'
import { decodeMessage, SEQUENTIAL_ID, SYSEX_START } from '../domain/sysex'
import { CC } from './nrpn'
import type { MidiConnection } from './connection'

export type Direction = 'in' | 'out'

export interface MonitorEntry {
  id: number
  direction: Direction
  time: number
  kind: string
  summary: string
  bytes: string
}

const SYSEX_OPCODES: Record<number, string> = {
  0x02: 'Program Data',
  0x03: 'Edit Buffer',
  0x05: 'Request Program',
  0x06: 'Request Edit Buffer',
  0x0e: 'Request Globals',
  0x0f: 'Global Data',
}

function hex(bytes: Uint8Array, limit = 16): string {
  const shown = [...bytes.subarray(0, limit)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
  return bytes.length > limit ? `${shown} … (${bytes.length} bytes)` : shown
}

export function describe(bytes: Uint8Array): { kind: string; summary: string } {
  if (bytes[0] === SYSEX_START) {
    if (bytes[1] === 0x7e) {
      const isReply = bytes[4] === 0x02
      const decoded = isReply ? decodeMessage(bytes) : null
      return {
        kind: 'SysEx',
        summary:
          decoded?.kind === 'deviceInquiry'
            ? `Device inquiry reply — family 0x${decoded.familyId.toString(16)}, OS ${decoded.version}`
            : 'Device inquiry request',
      }
    }
    if (bytes[1] === SEQUENTIAL_ID) {
      const op = SYSEX_OPCODES[bytes[3]] ?? `opcode 0x${bytes[3]?.toString(16)}`
      const slot = bytes[3] === 0x02 || bytes[3] === 0x05 ? ` group ${bytes[4] + 1} prog ${bytes[5] + 1}` : ''
      return { kind: 'SysEx', summary: `${op} (device 0x${bytes[2].toString(16)})${slot}` }
    }
    return { kind: 'SysEx', summary: `Non-Sequential manufacturer 0x${bytes[1]?.toString(16)}` }
  }

  const status = bytes[0] & 0xf0
  const channel = (bytes[0] & 0x0f) + 1
  switch (status) {
    case 0x80:
      return { kind: 'Note', summary: `Note off ${bytes[1]} · ch ${channel}` }
    case 0x90:
      return {
        kind: 'Note',
        summary: `${bytes[2] ? 'Note on' : 'Note off'} ${bytes[1]} vel ${bytes[2]} · ch ${channel}`,
      }
    case 0xc0:
      return { kind: 'Program', summary: `Program change ${bytes[1]} · ch ${channel}` }
    case 0xd0:
      return { kind: 'Pressure', summary: `Channel pressure ${bytes[1]}` }
    case 0xe0:
      return { kind: 'Bend', summary: `Pitch bend ${(bytes[2] << 7) | bytes[1]}` }
    case 0xb0: {
      const [, controller, value] = bytes
      if (controller === CC.NrpnParamMsb) return { kind: 'NRPN', summary: `Param MSB ${value}` }
      if (controller === CC.NrpnParamLsb) {
        const name = BY_NRPN.get(value)?.name
        return { kind: 'NRPN', summary: `Param LSB ${value}${name ? ` (${name})` : ''}` }
      }
      if (controller === CC.DataEntryMsb) return { kind: 'NRPN', summary: `Value MSB ${value}` }
      if (controller === CC.DataEntryLsb) return { kind: 'NRPN', summary: `Value LSB ${value}` }
      if (controller === CC.BankSelect) return { kind: 'Program', summary: `Bank select ${value}` }
      return { kind: 'CC', summary: `CC ${controller} = ${value} · ch ${channel}` }
    }
    default:
      return { kind: 'Other', summary: `Status 0x${bytes[0]?.toString(16)}` }
  }
}

const MAX_ENTRIES = 300

export class MidiMonitor {
  private entries: MonitorEntry[] = []
  private listeners = new Set<() => void>()
  private nextId = 1
  private teardown: (() => void)[] = []

  attach(connection: MidiConnection): void {
    this.teardown.push(connection.onMessage((data) => this.add('in', data)))
    this.teardown.push(connection.onSent((data) => this.add('out', data)))
  }

  detach(): void {
    for (const fn of this.teardown) fn()
    this.teardown = []
  }

  private add(direction: Direction, bytes: Uint8Array): void {
    // Note and clock traffic would bury everything else; the interesting rows are sysex,
    // program changes and parameter messages.
    if ((bytes[0] & 0xf0) === 0x90 || (bytes[0] & 0xf0) === 0x80) return
    if (bytes[0] >= 0xf8) return

    const { kind, summary } = describe(bytes)
    this.entries = [
      { id: this.nextId++, direction, time: Date.now(), kind, summary, bytes: hex(bytes) },
      ...this.entries,
    ].slice(0, MAX_ENTRIES)
    for (const fn of this.listeners) fn()
  }

  clear(): void {
    this.entries = []
    for (const fn of this.listeners) fn()
  }

  get snapshot(): MonitorEntry[] {
    return this.entries
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const monitor = new MidiMonitor()
