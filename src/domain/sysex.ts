/**
 * Prophet-5/10 Rev4 SysEx codec.
 *
 * Message shapes (Prophet-5 MIDI Implementation 1.4):
 *   Program Data      F0 01 <dev> 02 <group 0-9> <program 0-39> <152 packed bytes> F7
 *   Edit Buffer Data  F0 01 <dev> 03 <152 packed bytes> F7
 *   Request Program   F0 01 <dev> 05 <group> <program> F7
 *   Request Edit Buf  F0 01 <dev> 06 F7
 *   Request Globals   F0 01 <dev> 0E F7
 *   Global Data       F0 01 <dev> 0F <nibbles> F7
 *
 * The device ID byte is deliberately not a constant. The official doc contradicts itself (0x31 in
 * the sysex tables, 0x33 in the device-inquiry reply) and every real factory file here uses 0x32,
 * so we accept any of the three on receive and let the caller supply the ID on send — resolved at
 * runtime from a Universal Device Inquiry. That is also what lets a P5-authored file be sent to a
 * Prophet-10.
 */

export const SYSEX_START = 0xf0
export const SYSEX_END = 0xf7
export const SEQUENTIAL_ID = 0x01

/** Device IDs seen for the Prophet-5/10 Rev4 family across docs and real-world files. */
export const KNOWN_DEVICE_IDS = [0x31, 0x32, 0x33] as const
export const DEFAULT_DEVICE_ID = 0x32

export const Opcode = {
  ProgramData: 0x02,
  EditBufferData: 0x03,
  RequestProgram: 0x05,
  RequestEditBuffer: 0x06,
  RequestGlobals: 0x0e,
  GlobalData: 0x0f,
} as const

/**
 * Length of the unpacked program payload. The doc specifies 128 parameter bytes carried as 152
 * MIDI bytes, but 152 packed bytes unpack to 19 x 7 = 133. We keep all 133 so that re-encoding a
 * file reproduces it byte-for-byte, rather than assuming the 5 trailing bytes are zero.
 */
export const PAYLOAD_SIZE = 133
export const PACKED_PAYLOAD_SIZE = 152

/**
 * Packed MS-bit format: data travels in 8-byte packets where the first byte carries the stripped
 * high bits of the following 7, bit 0 mapping to the first of them.
 */
export function pack(data: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.subarray(i, i + 7)
    let msb = 0
    for (let j = 0; j < chunk.length; j++) msb |= ((chunk[j] >> 7) & 1) << j
    out.push(msb)
    for (let j = 0; j < chunk.length; j++) out.push(chunk[j] & 0x7f)
  }
  return new Uint8Array(out)
}

export function unpack(packed: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < packed.length; i += 8) {
    const msb = packed[i]
    const chunk = packed.subarray(i + 1, i + 8)
    for (let j = 0; j < chunk.length; j++) out.push(chunk[j] | (((msb >> j) & 1) << 7))
  }
  return new Uint8Array(out)
}

export interface ProgramDataMessage {
  kind: 'programData'
  deviceId: number
  group: number
  program: number
  payload: Uint8Array
}

export interface EditBufferMessage {
  kind: 'editBuffer'
  deviceId: number
  payload: Uint8Array
}

export interface GlobalDataMessage {
  kind: 'globalData'
  deviceId: number
  nibbles: Uint8Array
}

export interface DeviceInquiryMessage {
  kind: 'deviceInquiry'
  channel: number
  manufacturerId: number
  familyId: number
  familyMember: number
  version: string
}

export type DecodedMessage =
  | ProgramDataMessage
  | EditBufferMessage
  | GlobalDataMessage
  | DeviceInquiryMessage

function assertPayload(payload: Uint8Array): void {
  if (payload.length > PAYLOAD_SIZE) {
    throw new Error(`Payload too long: ${payload.length} bytes (max ${PAYLOAD_SIZE})`)
  }
}

/** Pad a payload out to the full 133 bytes so it always packs to exactly 152. */
function normalizePayload(payload: Uint8Array): Uint8Array {
  assertPayload(payload)
  if (payload.length === PAYLOAD_SIZE) return payload
  const full = new Uint8Array(PAYLOAD_SIZE)
  full.set(payload)
  return full
}

export function encodeProgramData(
  deviceId: number,
  group: number,
  program: number,
  payload: Uint8Array,
): Uint8Array {
  const packed = pack(normalizePayload(payload))
  const out = new Uint8Array(7 + packed.length)
  out.set([SYSEX_START, SEQUENTIAL_ID, deviceId, Opcode.ProgramData, group, program], 0)
  out.set(packed, 6)
  out[out.length - 1] = SYSEX_END
  return out
}

export function encodeEditBuffer(deviceId: number, payload: Uint8Array): Uint8Array {
  const packed = pack(normalizePayload(payload))
  const out = new Uint8Array(5 + packed.length)
  out.set([SYSEX_START, SEQUENTIAL_ID, deviceId, Opcode.EditBufferData], 0)
  out.set(packed, 4)
  out[out.length - 1] = SYSEX_END
  return out
}

export function requestProgram(deviceId: number, group: number, program: number): Uint8Array {
  return new Uint8Array([
    SYSEX_START,
    SEQUENTIAL_ID,
    deviceId,
    Opcode.RequestProgram,
    group,
    program,
    SYSEX_END,
  ])
}

export function requestEditBuffer(deviceId: number): Uint8Array {
  return new Uint8Array([
    SYSEX_START,
    SEQUENTIAL_ID,
    deviceId,
    Opcode.RequestEditBuffer,
    SYSEX_END,
  ])
}

export function requestGlobals(deviceId: number): Uint8Array {
  return new Uint8Array([SYSEX_START, SEQUENTIAL_ID, deviceId, Opcode.RequestGlobals, SYSEX_END])
}

/** Universal device inquiry. Channel 0x7f asks every device to answer. */
export function deviceInquiry(channel = 0x7f): Uint8Array {
  return new Uint8Array([SYSEX_START, 0x7e, channel, 0x06, 0x01, SYSEX_END])
}

/** Split a file or stream that may contain many concatenated sysex messages (i.e. a bank dump). */
export function splitSysex(bytes: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = []
  let start = -1
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === SYSEX_START) start = i
    else if (bytes[i] === SYSEX_END && start >= 0) {
      messages.push(bytes.subarray(start, i + 1))
      start = -1
    }
  }
  return messages
}

export function decodeMessage(bytes: Uint8Array): DecodedMessage | null {
  if (bytes.length < 5 || bytes[0] !== SYSEX_START || bytes[bytes.length - 1] !== SYSEX_END) {
    return null
  }

  // Universal non-realtime: device inquiry reply.
  if (bytes[1] === 0x7e && bytes[3] === 0x06 && bytes[4] === 0x02) {
    return {
      kind: 'deviceInquiry',
      channel: bytes[2],
      manufacturerId: bytes[5],
      familyId: bytes[6] | (bytes[7] << 7),
      familyMember: bytes[8] | (bytes[9] << 7),
      version: [bytes[10], bytes[11], bytes[12]].join('.'),
    }
  }

  if (bytes[1] !== SEQUENTIAL_ID) return null
  const deviceId = bytes[2]
  const body = bytes.subarray(0, bytes.length - 1)

  switch (bytes[3]) {
    case Opcode.ProgramData:
      return {
        kind: 'programData',
        deviceId,
        group: bytes[4],
        program: bytes[5],
        payload: unpack(body.subarray(6)),
      }
    case Opcode.EditBufferData:
      return { kind: 'editBuffer', deviceId, payload: unpack(body.subarray(4)) }
    case Opcode.GlobalData:
      return { kind: 'globalData', deviceId, nibbles: body.subarray(4) }
    default:
      return null
  }
}

export function isKnownDeviceId(id: number): boolean {
  return (KNOWN_DEVICE_IDS as readonly number[]).includes(id)
}

/**
 * Rewrite the device ID of an already-encoded Sequential message. Used when sending a file
 * authored for one member of the family (the factory patches are 0x32) to a synth that reports a
 * different ID.
 */
export function retargetDeviceId(message: Uint8Array, deviceId: number): Uint8Array {
  if (message[1] !== SEQUENTIAL_ID) return message
  const out = message.slice()
  out[2] = deviceId
  return out
}
