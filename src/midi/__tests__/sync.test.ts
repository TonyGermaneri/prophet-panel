/**
 * Exercises the two-way bridge with a fake connection, so the behaviour that matters when a
 * Prophet is plugged in — selecting a patch on the instrument moving the on-screen knobs — is
 * verified without the instrument.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { param } from '../../domain/parameters'
import { parseSyxFile } from '../../domain/patch'
import { encodeEditBuffer, encodeProgramData } from '../../domain/sysex'
import { PatchStore } from '../../state/store'
import type { MidiConnection } from '../connection'
import { CC, encodeNrpn } from '../nrpn'
import { SynthSync } from '../sync'

/** A stand-in for the Web MIDI port pair: records what was sent, injects what "arrives". */
function fakeConnection() {
  const handlers = new Set<(data: Uint8Array) => void>()
  const sent: Uint8Array[] = []
  const fake = {
    channel: 0,
    deviceId: 0x32,
    deviceIdConfirmed: true,
    sent,
    /** Optional stand-in for the instrument answering a request. */
    autoRespond: null as ((message: Uint8Array) => void) | null,
    send(data: Uint8Array | number[]) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      sent.push(bytes)
      fake.autoRespond?.(bytes)
    },
    /** Mirrors the real fan-out: every candidate ID until one is confirmed. */
    sendAddressed(build: (id: number) => Uint8Array) {
      if (fake.deviceIdConfirmed) fake.send(build(fake.deviceId))
      else for (const id of [0x31, 0x32, 0x33]) fake.send(build(id))
    },
    onMessage(fn: (data: Uint8Array) => void) {
      handlers.add(fn)
      return () => handlers.delete(fn)
    },
    receive(data: Uint8Array | number[]) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
      for (const fn of [...handlers]) fn(bytes)
    },
  }
  return fake
}

const BRASS = parseSyxFile(
  new Uint8Array(
    readFileSync(
      join(process.cwd(), 'patches', 'factory', 'Rev3_Group1', 'P5_Factory-G5-1-1_BRASS.syx'),
    ),
  ),
)[0]

const isRequestEditBuffer = (m: Uint8Array) => m[0] === 0xf0 && m[3] === 0x06

describe('synth to panel', () => {
  let connection: ReturnType<typeof fakeConnection>
  let store: PatchStore
  let sync: SynthSync

  beforeEach(() => {
    vi.useFakeTimers()
    connection = fakeConnection()
    store = new PatchStore()
    sync = new SynthSync(connection as unknown as MidiConnection, store)
    sync.start()
  })

  afterEach(() => {
    sync.stop()
    vi.useRealTimers()
  })

  it('moves the panel when an edit buffer dump arrives', () => {
    expect(store.get('filterEnvAmount')).not.toBe(91)

    connection.receive(encodeEditBuffer(0x32, BRASS.payload))

    expect(store.name).toBe('BRASS')
    expect(store.get('filterEnvAmount')).toBe(91)
    expect(store.get('filterCutoff')).toBe(0)
    expect(store.get('mixOscA')).toBe(120)
    expect(store.get('oscASaw')).toBe(1)
  })

  it('follows a program change made on the instrument', () => {
    connection.receive([0xb0, CC.BankSelect, 5]) // group 5
    connection.receive([0xc0, 9]) // program 10

    expect(store.group).toBe(4)
    expect(store.program).toBe(9)

    // The request is deliberately deferred so the synth can finish loading the program.
    expect(connection.sent.filter(isRequestEditBuffer)).toHaveLength(0)
    vi.advanceTimersByTime(200)
    expect(connection.sent.filter(isRequestEditBuffer)).toHaveLength(1)

    // The dump that comes back drives the knobs, and stops the retry from firing.
    connection.receive(encodeEditBuffer(0x32, BRASS.payload))
    vi.advanceTimersByTime(1000)
    expect(connection.sent.filter(isRequestEditBuffer)).toHaveLength(1)
    expect(store.get('filterEnvAmount')).toBe(91)
  })

  it('retries once when the synth does not answer the first request', () => {
    connection.receive([0xc0, 3])
    vi.advanceTimersByTime(200)
    expect(connection.sent.filter(isRequestEditBuffer)).toHaveLength(1)
    vi.advanceTimersByTime(500)
    expect(connection.sent.filter(isRequestEditBuffer)).toHaveLength(2)
  })

  it('does not chase the synth when following is switched off', () => {
    sync.follow = false
    connection.receive([0xc0, 3])
    vi.advanceTimersByTime(1000)
    expect(connection.sent.filter(isRequestEditBuffer)).toHaveLength(0)
    // The slot still tracks the instrument even when the sound is not pulled.
    expect(store.program).toBe(3)
  })

  it('applies an incoming NRPN to the matching control', () => {
    connection.receive(encodeNrpn(0, param('filterCutoff').nrpn, 99))
    expect(store.get('filterCutoff')).toBe(99)
  })

  it('tolerates the synth omitting the parameter number on later messages', () => {
    connection.receive(encodeNrpn(0, param('filterResonance').nrpn, 40))
    // Running-status style: only the value bytes for the already-selected parameter.
    connection.receive([0xb0, CC.DataEntryMsb, 0])
    connection.receive([0xb0, CC.DataEntryLsb, 77])
    expect(store.get('filterResonance')).toBe(77)
  })

  it('does not echo synth-originated changes back to the synth', async () => {
    connection.receive(encodeNrpn(0, param('filterCutoff').nrpn, 99))
    await Promise.resolve()
    expect(connection.sent).toHaveLength(0)
  })

  it('sends a knob move as NRPN, coalesced to one message per parameter', async () => {
    store.set('filterCutoff', 10, 'ui')
    store.set('filterCutoff', 20, 'ui')
    store.set('filterCutoff', 30, 'ui')
    await Promise.resolve()

    expect(connection.sent).toHaveLength(1)
    const expected = encodeNrpn(0, param('filterCutoff').nrpn, 30)
    expect([...connection.sent[0]]).toEqual(expected)
  })

  it('flushes without needing an animation frame', async () => {
    // A hidden tab gets no frames at all. Tying the flush to one stranded every edit for as long
    // as the window sat in the background, which is when a hardware controller is most likely in
    // use, so the flush must not depend on rAF being called.
    const raf = globalThis.requestAnimationFrame
    // @ts-expect-error deliberately removing the API to prove it is not relied on
    delete globalThis.requestAnimationFrame

    store.set('filterResonance', 42, 'ui')
    await Promise.resolve()
    expect(connection.sent).toHaveLength(1)

    globalThis.requestAnimationFrame = raf
  })

  it('addresses a patch send to every candidate ID until the synth identifies itself', () => {
    // NRPN carries no device ID, so parameter control works regardless. A patch transfer does
    // carry one, and the synth silently drops anything addressed elsewhere — on a fresh origin
    // that looks like "knobs work but patches do nothing".
    connection.deviceIdConfirmed = false
    sync.sendEditBuffer(BRASS)
    expect(connection.sent.map((m) => m[2])).toEqual([0x31, 0x32, 0x33])
    expect(connection.sent.every((m) => m[3] === 0x03)).toBe(true)

    connection.sent.length = 0
    connection.deviceIdConfirmed = true
    sync.sendEditBuffer(BRASS)
    expect(connection.sent.map((m) => m[2])).toEqual([0x32])
  })

  it('addresses a program write the same way', () => {
    connection.deviceIdConfirmed = false
    sync.writeProgram(BRASS, 4, 9)
    expect(connection.sent.map((m) => m[2])).toEqual([0x31, 0x32, 0x33])
    expect(connection.sent.every((m) => m[3] === 0x02 && m[4] === 4 && m[5] === 9)).toBe(true)
  })

  it('keeps the panel out of a bulk library fetch', async () => {
    // Answer every program request the way the instrument would, so the fetch runs to completion.
    connection.autoRespond = (message) => {
      if (message[0] === 0xf0 && message[3] === 0x05) {
        connection.receive(encodeProgramData(0x32, message[4], message[5], BRASS.payload))
      }
    }

    const before = store.get('filterEnvAmount')
    const collected: unknown[] = []
    const fetched = await sync.fetchGroups([0], (patch) => collected.push(patch))

    expect(fetched).toHaveLength(40)
    expect(collected).toHaveLength(40)
    // Forty patches landed in the library and the panel never moved.
    expect(store.get('filterEnvAmount')).toBe(before)
    expect(store.name).toBe('INIT PROGRAM')
  })
})
