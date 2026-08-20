/**
 * Passing performance messages from a controller through to the synth.
 *
 * Only channel-voice messages are forwarded. System messages are not: clock and active sensing
 * would flood the port, and a sysex message from a controller is not ours to relay — it could
 * address the synth's globals or its program memory.
 *
 * The same reasoning rules out most control changes, which is less obvious. On this instrument a
 * CC is not a performance gesture but a program edit: fifty-seven numbers are wired to parameters,
 * so relaying an unbound knob's CC silently rewrites the patch — and the panel then follows the
 * synth's report of a change nobody asked for. A controller knob that has not been bound should do
 * nothing at all, so a CC the parameter table claims is dropped rather than passed on. Everything a
 * player actually reaches for — the wheels, expression, the pedals, volume — is left alone, since
 * the instrument claims none of those numbers.
 *
 * The messages that carry NRPN go the same way, and for the same reason spelled differently: a
 * controller that speaks NRPN addresses parameters by number, and its numbering is its own. Passing
 * those on lets another synth's knob land on whichever Prophet parameter happens to share a number.
 * Bank select is not among them — it addresses a patch rather than a parameter, and a controller
 * sending it alongside a program change is asking for a sound, which is a reasonable thing to relay.
 */

import { BY_CC } from '../domain/parameters'
import { CC } from './nrpn'

/**
 * Selecting a parameter by number and writing to it. Blocked in both of its forms, since the
 * numbering belongs to whichever device is sending. Data entry is what writes, so blocking it
 * leaves RPN inert too — no loss, as nothing here needs a controller to set a bend range.
 */
const PARAMETER_WRITE_CCS = new Set<number>([
  CC.NrpnParamMsb,
  CC.NrpnParamLsb,
  CC.DataEntryMsb,
  CC.DataEntryLsb,
  CC.DataIncrement,
  CC.DataDecrement,
])

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

/**
 * Split a buffer into the individual messages it holds.
 *
 * One event is not one message. A driver may coalesce a burst into a single buffer, a controller
 * may use running status and send the status byte once for a whole run, and a real-time byte is
 * allowed to land between any two bytes of anything — including partway through a message. Reading
 * only the first three bytes therefore drops traffic, and worse, decides the fate of a whole buffer
 * from whatever happened to arrive at the front of it.
 */
export function splitMessages(data: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  let status = 0
  let want = 0
  let pending: number[] = []

  for (const byte of data) {
    // Real-time is interleavable anywhere and never interrupts what is being assembled.
    if (byte >= 0xf8) continue
    if (byte >= 0xf0) {
      // System common is not ours to relay, and it cancels running status.
      status = 0
      want = 0
      pending = []
      continue
    }
    if (byte >= 0x80) {
      status = byte
      want = CHANNEL_VOICE[byte & 0xf0] ?? 0
      pending = []
      continue
    }
    if (!want) continue
    pending.push(byte)
    if (pending.length === want - 1) {
      out.push(new Uint8Array([status, ...pending]))
      // Running status: the next data byte begins another message on the same status.
      pending = []
    }
  }

  return out
}

export function forwardable(data: Uint8Array): boolean {
  const status = data[0] & 0xf0
  const length = CHANNEL_VOICE[status]
  if (length === undefined || data.length < length) return false
  // A control change the parameter table claims is a patch edit, not something to play with, and
  // an NRPN fragment is a parameter write addressed by number.
  if (status === 0xb0 && (BY_CC.has(data[1]) || PARAMETER_WRITE_CCS.has(data[1]))) return false
  return true
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
