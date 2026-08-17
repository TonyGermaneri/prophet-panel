/**
 * NRPN encoding and decoding.
 *
 * A parameter change is four control-change messages: parameter number MSB/LSB (CC 99/98) then
 * value MSB/LSB (CC 6/38). Parameter numbers and values are each split into two 7-bit halves.
 */

export const CC = {
  NrpnParamMsb: 99,
  NrpnParamLsb: 98,
  DataEntryMsb: 6,
  DataEntryLsb: 38,
  DataIncrement: 96,
  DataDecrement: 97,
  RpnParamLsb: 100,
  RpnParamMsb: 101,
  BankSelect: 32,
} as const

export function encodeNrpn(channel: number, nrpn: number, value: number): number[] {
  const status = 0xb0 | (channel & 0x0f)
  return [
    status,
    CC.NrpnParamMsb,
    (nrpn >> 7) & 0x7f,
    status,
    CC.NrpnParamLsb,
    nrpn & 0x7f,
    status,
    CC.DataEntryMsb,
    (value >> 7) & 0x7f,
    status,
    CC.DataEntryLsb,
    value & 0x7f,
  ]
}

export function encodeCC(channel: number, cc: number, value: number): number[] {
  return [0xb0 | (channel & 0x0f), cc & 0x7f, value & 0x7f]
}

export function encodeProgramChange(channel: number, program: number): number[] {
  return [0xc0 | (channel & 0x0f), program & 0x7f]
}

export function encodeNoteOn(channel: number, note: number, velocity: number): number[] {
  return [0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f]
}

export function encodeNoteOff(channel: number, note: number): number[] {
  return [0x80 | (channel & 0x0f), note & 0x7f, 0]
}

export function encodePitchBend(channel: number, value14: number): number[] {
  const v = Math.max(0, Math.min(16383, value14))
  return [0xe0 | (channel & 0x0f), v & 0x7f, (v >> 7) & 0x7f]
}

export interface NrpnEvent {
  nrpn: number
  value: number
}

/**
 * Stateful NRPN receiver.
 *
 * The synth tracks the most recently selected NRPN and may send only the value bytes for
 * subsequent changes, so the parameter number has to persist between messages rather than being
 * expected on every one. Increment/decrement are also honoured, since some controllers use them.
 */
export class NrpnReceiver {
  private paramMsb = 0
  private paramLsb = 0
  private valueMsb = 0
  private selected = false
  private lastValue = 0

  constructor(private readonly emit: (event: NrpnEvent) => void) {}

  /**
   * Feed raw MIDI. Non-CC messages are ignored.
   *
   * A buffer may hold more than one control change: a driver is free to coalesce running-status
   * traffic into a single event, and a whole four-message NRPN often arrives that way. Walking
   * the buffer rather than reading only the first three bytes means those are not silently
   * dropped down to their first message.
   */
  feed(data: Uint8Array): void {
    for (let i = 0; i + 2 < data.length; i += 3) {
      if ((data[i] & 0xf0) !== 0xb0) return
      this.handleControlChange(data[i + 1], data[i + 2])
    }
  }

  private handleControlChange(controller: number, value: number): void {
    switch (controller) {
      case CC.NrpnParamMsb:
        this.paramMsb = value
        this.selected = true
        break
      case CC.NrpnParamLsb:
        this.paramLsb = value
        this.selected = true
        break
      case CC.DataEntryMsb:
        this.valueMsb = value
        break
      case CC.DataEntryLsb: {
        if (!this.selected) return
        this.lastValue = (this.valueMsb << 7) | value
        this.emit({ nrpn: (this.paramMsb << 7) | this.paramLsb, value: this.lastValue })
        break
      }
      case CC.DataIncrement:
      case CC.DataDecrement: {
        if (!this.selected) return
        this.lastValue += controller === CC.DataIncrement ? 1 : -1
        this.lastValue = Math.max(0, this.lastValue)
        this.emit({ nrpn: (this.paramMsb << 7) | this.paramLsb, value: this.lastValue })
        break
      }
      case CC.RpnParamLsb:
      case CC.RpnParamMsb:
        // RPN 127/127 is the reset-parameter-number message; it clears NRPN selection.
        if (value === 0x7f) this.selected = false
        break
    }
  }
}
