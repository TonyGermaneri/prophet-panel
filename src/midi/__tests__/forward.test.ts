import { describe, expect, it } from 'vitest'

import { forwardable, remapChannel } from '../forward'

describe('forwarding controller messages to the synth', () => {
  it('relays channel-voice messages', () => {
    for (const status of [0x80, 0x90, 0xa0, 0xb0, 0xe0]) {
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
