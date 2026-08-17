/**
 * Passing performance messages from a controller through to the synth.
 *
 * Only channel-voice messages are forwarded. System messages are not: clock and active sensing
 * would flood the port, and a sysex message from a controller is not ours to relay — it could
 * address the synth's globals or its program memory.
 */

/** Status nibbles worth relaying, and how many bytes each message carries. */
const CHANNEL_VOICE: Record<number, number> = {
  0x80: 3, // note off
  0x90: 3, // note on
  0xa0: 3, // polyphonic key pressure
  0xb0: 3, // control change
  0xc0: 2, // program change
  0xd0: 2, // channel pressure
  0xe0: 3, // pitch bend
}

export function forwardable(data: Uint8Array): boolean {
  const length = CHANNEL_VOICE[data[0] & 0xf0]
  return length !== undefined && data.length >= length
}

/**
 * Rewrite a message onto the channel the synth is listening on. A controller fixed to channel 1
 * would otherwise be silent whenever the Prophet is set to anything else, which looks like a
 * broken connection rather than a channel mismatch.
 */
export function remapChannel(data: Uint8Array, channel: number): Uint8Array {
  const out = data.slice()
  out[0] = (out[0] & 0xf0) | (channel & 0x0f)
  return out
}
