/**
 * Web MIDI transport.
 *
 * Sysex access needs `{ sysex: true }` and a secure context; the Vite dev server on localhost
 * qualifies, so no TLS is needed in development. Chrome and Edge implement this; Safari does not.
 */

import { settings } from '../state/settings'
import {
  DEFAULT_DEVICE_ID,
  decodeMessage,
  deviceInquiry,
  isKnownDeviceId,
  KNOWN_DEVICE_IDS,
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

/** Receives traffic from every connected input, tagged with its port, for MIDI learn. */
export type PortMessageHandler = (portId: string, portName: string, data: Uint8Array) => void

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

  /**
   * True once the instrument has actually answered on `deviceId`. Until then requests are sent to
   * every ID in the family: a request addressed to the wrong ID is silently ignored, which would
   * otherwise leave the ID undiscoverable — the reply we need to learn it can never arrive.
   */
  deviceIdConfirmed = false

  private handlers = new Set<MessageHandler>()
  private sentHandlers = new Set<MessageHandler>()
  private portHandlers = new Set<PortMessageHandler>()
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
      this.access.onstatechange = () => {
        // Ports appearing or disappearing must be (re)attached, or a device plugged in later
        // would never be heard by MIDI learn.
        this.listenToAllInputs()
        this.notify()
      }
      this.channel = settings.current.channel
      this.listenToAllInputs()
      this.restoreOrAutoSelect()
      settings.update({ hasConnected: true })
    } catch {
      this.state = 'denied'
    }
    this.notify()
    return this.state
  }

  /**
   * Every input is listened to, not just the selected one, so MIDI learn can hear a controller
   * that is not the synth. Only the selected port is routed into the sync/monitor path.
   */
  private listenToAllInputs(): void {
    for (const port of this.access?.inputs.values() ?? []) {
      port.onmidimessage = (e: MIDIMessageEvent) => {
        if (!e.data) return
        const data = new Uint8Array(e.data)
        for (const fn of this.portHandlers) fn(port.id, port.name ?? port.id, data)
        if (port.id === this.input?.id) this.receive(data)
      }
    }
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

  /**
   * Restore last session's ports, then fall back. Port ids are not stable across sessions on
   * every platform, so a remembered name is used as the second-chance match before guessing.
   */
  private restoreOrAutoSelect(): void {
    const saved = settings.current
    const inputs = [...(this.access?.inputs.values() ?? [])]
    const outputs = [...(this.access?.outputs.values() ?? [])]
    const looksRight = (name: string) => /prophet/i.test(name)

    const pick = <T extends MIDIPort>(ports: T[], id: string | null, name: string | null) =>
      ports.find((p) => p.id === id) ??
      ports.find((p) => name !== null && p.name === name) ??
      ports.find((p) => looksRight(p.name ?? '')) ??
      ports[0]

    this.setInput(pick(inputs, saved.inputId, saved.inputName)?.id ?? null)
    this.setOutput(pick(outputs, saved.outputId, saved.outputName)?.id ?? null)
  }

  setInput(id: string | null): void {
    this.input = id ? (this.access?.inputs.get(id) ?? null) : null
    settings.update({ inputId: this.input?.id ?? null, inputName: this.input?.name ?? null })
    this.notify()
  }

  setOutput(id: string | null): void {
    this.output = id ? (this.access?.outputs.get(id) ?? null) : null
    settings.update({ outputId: this.output?.id ?? null, outputName: this.output?.name ?? null })
    this.notify()
  }

  setChannel(channel: number): void {
    this.channel = channel
    settings.update({ channel })
    this.notify()
  }

  private receive(data: Uint8Array): void {
    // Adopt the device ID from any Sequential sysex the instrument sends, so a Prophet-10 that
    // uses a different ID than the factory files is handled without configuration.
    if (data[0] === SYSEX_START && data[1] === SEQUENTIAL_ID && isKnownDeviceId(data[2])) {
      if (this.deviceId !== data[2] || !this.deviceIdConfirmed) {
        this.deviceId = data[2]
        this.deviceIdConfirmed = true
        this.notify()
      }
    }
    for (const fn of this.handlers) fn(data)
  }

  send(data: Uint8Array | number[]): void {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    this.output?.send(Array.from(bytes))
    for (const fn of this.sentHandlers) fn(bytes)
  }

  /**
   * Send a Sequential request once per candidate device ID, until one is confirmed. The synth
   * ignores requests addressed to another ID, so the extra messages are harmless.
   */
  sendRequest(build: (deviceId: number) => Uint8Array): void {
    if (this.deviceIdConfirmed) {
      this.send(build(this.deviceId))
      return
    }
    for (const id of KNOWN_DEVICE_IDS) this.send(build(id))
  }

  onMessage(fn: MessageHandler): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  onSent(fn: MessageHandler): () => void {
    this.sentHandlers.add(fn)
    return () => this.sentHandlers.delete(fn)
  }

  /** Traffic from every input, tagged with its port. Used by MIDI learn and binding playback. */
  onPortMessage(fn: PortMessageHandler): () => void {
    this.portHandlers.add(fn)
    return () => this.portHandlers.delete(fn)
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
        if (isKnownDeviceId(info.deviceId)) {
          this.deviceId = info.deviceId
          this.deviceIdConfirmed = true
        }
        this.notify()
        resolve(info)
      })

      this.send(deviceInquiry())
    })
  }
}

export const connection = new MidiConnection()
