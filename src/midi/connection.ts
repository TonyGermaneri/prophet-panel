/**
 * Web MIDI transport.
 *
 * Sysex access needs `{ sysex: true }` and a secure context; the Vite dev server on localhost
 * qualifies, so no TLS is needed in development. Chrome and Edge implement this; Safari does not.
 */

import {
  DEFAULT_DEVICE_ID,
  decodeMessage,
  deviceInquiry,
  isKnownDeviceId,
  SEQUENTIAL_ID,
  SYSEX_START,
} from '../domain/sysex'

export interface PortInfo {
  id: string
  name: string
}

export interface DeviceInfo {
  /** The sysex device ID the instrument actually answers with — never assumed. */
  deviceId: number
  familyId: number
  familyMember: number
  version: string
  model: string
}

export type ConnectionState = 'idle' | 'unsupported' | 'denied' | 'ready'

/** Family IDs seen for this generation. The doc contradicts itself, so all three are accepted. */
const MODEL_NAMES: Record<number, string> = {
  0x31: 'Prophet-5/10 Rev4',
  0x32: 'Prophet-5 Rev4',
  0x33: 'Prophet-10 Rev4',
}

export type MessageHandler = (data: Uint8Array) => void

export class MidiConnection {
  state: ConnectionState = 'idle'
  access: MIDIAccess | null = null
  input: MIDIInput | null = null
  output: MIDIOutput | null = null
  device: DeviceInfo | null = null
  channel = 0

  /**
   * The device ID used when sending. Defaults to the value the factory files carry, and is
   * replaced by whatever the connected instrument reports from a device inquiry.
   */
  deviceId = DEFAULT_DEVICE_ID

  private handlers = new Set<MessageHandler>()
  private stateHandlers = new Set<() => void>()

  async connect(): Promise<ConnectionState> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      this.state = 'unsupported'
      this.notify()
      return this.state
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: true })
      this.state = 'ready'
      this.access.onstatechange = () => this.notify()
      this.autoSelect()
    } catch {
      this.state = 'denied'
    }
    this.notify()
    return this.state
  }

  get inputs(): PortInfo[] {
    return [...(this.access?.inputs.values() ?? [])].map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
    }))
  }

  get outputs(): PortInfo[] {
    return [...(this.access?.outputs.values() ?? [])].map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
    }))
  }

  /** Prefer a port that names itself a Prophet; otherwise take the first available. */
  private autoSelect(): void {
    const looksRight = (name: string) => /prophet/i.test(name)
    const inputs = [...(this.access?.inputs.values() ?? [])]
    const outputs = [...(this.access?.outputs.values() ?? [])]
    this.setInput((inputs.find((p) => looksRight(p.name ?? '')) ?? inputs[0])?.id ?? null)
    this.setOutput((outputs.find((p) => looksRight(p.name ?? '')) ?? outputs[0])?.id ?? null)
  }

  setInput(id: string | null): void {
    if (this.input) this.input.onmidimessage = null
    this.input = id ? (this.access?.inputs.get(id) ?? null) : null
    if (this.input) {
      this.input.onmidimessage = (e: MIDIMessageEvent) => {
        if (e.data) this.receive(new Uint8Array(e.data))
      }
    }
    this.notify()
  }

  setOutput(id: string | null): void {
    this.output = id ? (this.access?.outputs.get(id) ?? null) : null
    this.notify()
  }

  private receive(data: Uint8Array): void {
    // Adopt the device ID from any Sequential sysex the instrument sends, so a Prophet-10 that
    // uses a different ID than the factory files is handled without configuration.
    if (data[0] === SYSEX_START && data[1] === SEQUENTIAL_ID && isKnownDeviceId(data[2])) {
      this.deviceId = data[2]
    }
    for (const fn of this.handlers) fn(data)
  }

  send(data: Uint8Array | number[]): void {
    this.output?.send(Array.from(data))
  }

  onMessage(fn: MessageHandler): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  onStateChange(fn: () => void): () => void {
    this.stateHandlers.add(fn)
    return () => this.stateHandlers.delete(fn)
  }

  private notify(): void {
    for (const fn of this.stateHandlers) fn()
  }

  /**
   * Universal device inquiry. This is how the device ID ambiguity gets settled: the instrument
   * states its own family ID and we send with that from then on.
   */
  async identify(timeoutMs = 800): Promise<DeviceInfo | null> {
    if (!this.output) return null
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        stop()
        resolve(null)
      }, timeoutMs)

      const stop = this.onMessage((data) => {
        const decoded = decodeMessage(data)
        if (decoded?.kind !== 'deviceInquiry') return
        window.clearTimeout(timer)
        stop()
        const info: DeviceInfo = {
          deviceId: decoded.familyId & 0x7f,
          familyId: decoded.familyId,
          familyMember: decoded.familyMember,
          version: decoded.version,
          model: MODEL_NAMES[decoded.familyId & 0x7f] ?? `Unknown (0x${decoded.familyId.toString(16)})`,
        }
        this.device = info
        if (isKnownDeviceId(info.deviceId)) this.deviceId = info.deviceId
        this.notify()
        resolve(info)
      })

      this.send(deviceInquiry())
    })
  }
}

export const connection = new MidiConnection()
