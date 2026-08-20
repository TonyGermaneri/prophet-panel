/**
 * Pass-through from the performance controller.
 *
 * The rule being pinned here is that pass-through must not edit the patch. On this instrument a
 * control change is a parameter write, so relaying an unbound knob rewrites the sound on the synth
 * and the panel then follows the report of a change nobody made. The tests below cover both halves
 * of getting that right: which messages are relayed at all, and splitting a buffer so the fate of
 * one message is never decided by whatever arrived in front of it.
 */

import { describe, expect, it } from 'vitest'

import { BY_CC } from '../../domain/parameters'
import { forwardable, remapChannel, splitMessages } from '../forward'

/** CC 74 is the spec's Brightness and a controller staple; this synth claims no such number. */
const FREE_CC = 74
/** Wheel-Mod Freq A. Relaying this toggles a destination switch on the instrument. */
const PARAM_CC = 54

describe('forwarding controller messages to the synth', () => {
  it('relays channel-voice messages', () => {
    for (const status of [0x80, 0x90, 0xa0, 0xe0]) {
      expect(forwardable(new Uint8Array([status, 60, 100])), status.toString(16)).toBe(true)
    }
    for (const status of [0xc0, 0xd0]) {
      expect(forwardable(new Uint8Array([status, 60])), status.toString(16)).toBe(true)
    }
  })

  it('refuses system messages', () => {
    // Clock and active sensing would flood the port; sysex from a controller could address the
    // synth's globals or program memory and is not ours to relay.
    for (const status of [0xf0, 0xf8, 0xfa, 0xfe, 0xff]) {
      expect(forwardable(new Uint8Array([status, 0, 0])), status.toString(16)).toBe(false)
    }
  })

  it('refuses a truncated message rather than sending a malformed one', () => {
    expect(forwardable(new Uint8Array([0x90, 60]))).toBe(false)
    expect(forwardable(new Uint8Array([0xd0]))).toBe(false)
  })

  it('refuses a control change the synth reads as a parameter edit', () => {
    expect(BY_CC.has(PARAM_CC)).toBe(true)
    expect(forwardable(new Uint8Array([0xb0, PARAM_CC, 127]))).toBe(false)
    // Every number the parameter table claims, not just the one that caused the bug report.
    for (const cc of BY_CC.keys()) {
      expect(forwardable(new Uint8Array([0xb0, cc, 64])), `CC ${cc}`).toBe(false)
    }
  })

  it('still relays the controls a player actually reaches for', () => {
    // Wheels, pedals, expression and volume: none of these are parameters on this instrument.
    for (const cc of [1, 2, 4, 5, 7, 11, 64, 65, 66, 67, 68, 69, FREE_CC]) {
      expect(forwardable(new Uint8Array([0xb0, cc, 64])), `CC ${cc}`).toBe(true)
    }
  })

  it('rewrites the channel without touching the data bytes', () => {
    const remapped = remapChannel(new Uint8Array([0x92, 60, 100]), 5)
    expect([...remapped]).toEqual([0x95, 60, 100])
  })

  it('does not mutate the message it was given', () => {
    const original = new Uint8Array([0x92, 60, 100])
    remapChannel(original, 5)
    expect([...original]).toEqual([0x92, 60, 100])
  })

  it('masks a channel outside 0-15 instead of corrupting the status byte', () => {
    expect(remapChannel(new Uint8Array([0x90, 60, 100]), 16)[0]).toBe(0x90)
  })
})

describe('splitting a buffer into messages', () => {
  const split = (...bytes: number[]) => splitMessages(new Uint8Array(bytes)).map((m) => [...m])

  it('returns a single message unchanged', () => {
    expect(split(0xb0, FREE_CC, 64)).toEqual([[0xb0, FREE_CC, 64]])
  })

  it('separates messages a driver coalesced into one event', () => {
    expect(split(0xb0, PARAM_CC, 127, 0xb0, FREE_CC, 64)).toEqual([
      [0xb0, PARAM_CC, 127],
      [0xb0, FREE_CC, 64],
    ])
  })

  it('expands running status, where the status byte is sent once for a run', () => {
    expect(split(0xb0, FREE_CC, 1, FREE_CC, 2, FREE_CC, 3)).toEqual([
      [0xb0, FREE_CC, 1],
      [0xb0, FREE_CC, 2],
      [0xb0, FREE_CC, 3],
    ])
  })

  it('steps over real-time bytes wherever they land, including mid-message', () => {
    expect(split(0xf8, 0xb0, 0xfe, FREE_CC, 0xf8, 64, 0xfe)).toEqual([[0xb0, FREE_CC, 64]])
  })

  it('handles the two-byte messages, which are the ones an off-by-one eats', () => {
    expect(split(0xc0, 5, 0xd0, 90, 0x90, 60, 100)).toEqual([
      [0xc0, 5],
      [0xd0, 90],
      [0x90, 60, 100],
    ])
  })

  it('drops a trailing fragment rather than emitting half a message', () => {
    expect(split(0xb0, FREE_CC, 64, 0x90, 60)).toEqual([[0xb0, FREE_CC, 64]])
  })

  it('lets system common cancel running status, as the spec requires', () => {
    // Without the reset, the bytes after the song-position message would be read as more CCs.
    expect(split(0xb0, FREE_CC, 64, 0xf2, 10, 20)).toEqual([[0xb0, FREE_CC, 64]])
  })

  it('ignores data bytes with no status to attach them to', () => {
    expect(split(64, 65, 66)).toEqual([])
  })
})
