/**
 * The instrument connection.
 *
 * Everything here is about *this synthesizer* rather than about any one host: which ports were
 * chosen, which sysex device ID the instrument actually answers on, and how a controller's
 * performance messages are relayed onto the synth's channel. The transport underneath — Web MIDI
 * in the browser, the host's MIDI stack in the plugin — is supplied as a `MidiBackend`, so none of
 * this logic is written twice.
 */

import { platform } from '@platform'
import type { ConnectionState, MidiBackend, PortInfo, PortMessageHandler } from '@platform'

import { settings } from '../state/settings'
import { forwardable, remapChannel } from './forward'
import {
  DEFAULT_DEVICE_ID,
  decodeMessage,
  deviceInquiry,
  isKnownDeviceId,
  KNOWN_DEVICE_IDS,
  SEQUENTIAL_ID,
  SYSEX_START,
} from '../domain/sysex'

export type { ConnectionState, PortInfo, PortMessageHandler } from '@platform'

export interface DeviceInfo {
  /** The sysex device ID the instrument actually answers with — never assumed. */
  deviceId: number
  familyId: number
  familyMember: number
  version: string
  model: string
}

/** Family IDs seen for this generation. The doc contradicts itself, so all three are accepted. */
const MODEL_NAMES: Record<number, string> = {
  0x31: 'Prophet-5/10 Rev4',
  0x32: 'Prophet-5 Rev4',
  0x33: 'Prophet-10 Rev4',
}

export type MessageHandler = (data: Uint8Array) => void

export class MidiConnection {
  state: ConnectionState = 'idle'
  input: PortInfo | null = null
  output: PortInfo | null = null
  /** The performance controller, distinct from the synth's own input. */
  controllerInput: PortInfo | null = null
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
  private detach: (() => void)[] = []

  constructor(private backend: MidiBackend = platform.midi) {}

  /**
   * Whether the transport actually permits sysex. Access can be granted without it, in which case
   * parameter control works and every patch transfer fails — worth stating plainly.
   */
  get sysexEnabled(): boolean {
    return this.backend.sysexEnabled
  }

  async connect(): Promise<ConnectionState> {
    // Connecting twice is normal — the app connects on mount and the settings dialog offers a
    // retry — so previous subscriptions are dropped rather than stacked. Without this every
    // reconnect would deliver each message one more time than the last.
    for (const off of this.detach.splice(0)) off()

    this.state = await this.backend.open()
    if (this.state !== 'ready') {
      this.notify()
      return this.state
    }

    // Every input is listened to, not just the selected one, so MIDI learn can hear a controller
    // that is not the synth. Only the selected port is routed into the sync/monitor path.
    this.detach.push(
      this.backend.onMessage((portId, portName, data) => {
        for (const fn of this.portHandlers) fn(portId, portName, data)
        if (portId === this.input?.id) this.receive(data)
      }),
      this.backend.onPortsChanged(() => this.notify()),
    )

    this.channel = settings.current.channel
    this.restoreOrAutoSelect()
    settings.update({ hasConnected: true })
    this.notify()
    return this.state
  }

  get inputs(): PortInfo[] {
    return this.backend.inputs
  }

  get outputs(): PortInfo[] {
    return this.backend.outputs
  }

  /**
   * Restore last session's ports, then fall back. Port ids are not stable across sessions on
   * every platform, so a remembered name is used as the second-chance match before guessing.
   */
  private restoreOrAutoSelect(): void {
    const saved = settings.current
    const inputs = this.backend.inputs
    const outputs = this.backend.outputs
    const looksRight = (name: string) => /prophet/i.test(name)

    const pick = (ports: PortInfo[], id: string | null, name: string | null) =>
      ports.find((p) => p.id === id) ??
      ports.find((p) => name !== null && p.name === name) ??
      ports.find((p) => looksRight(p.name)) ??
      ports[0]

    this.setInput(pick(inputs, saved.inputId, saved.inputName)?.id ?? null)
    this.setOutput(pick(outputs, saved.outputId, saved.outputName)?.id ?? null)

    // The controller defaults to the first port that is not the synth. Choosing the synth's own
    // port would loop its keyboard straight back at it.
    const others = inputs.filter((p) => p.id !== this.input?.id)
    this.setControllerInput(
      (others.find((p) => p.id === saved.controllerInputId) ??
        others.find(
          (p) => saved.controllerInputName !== null && p.name === saved.controllerInputName,
        ) ??
        others[0])?.id ?? null,
    )
  }

  /** Inputs eligible as a performance controller: everything except the synth's own port. */
  get controllerInputs(): PortInfo[] {
    return this.inputs.filter((p) => p.id !== this.input?.id)
  }

  setInput(id: string | null): void {
    this.input = id ? (this.backend.inputs.find((p) => p.id === id) ?? null) : null
    settings.update({ inputId: this.input?.id ?? null, inputName: this.input?.name ?? null })
    // Selecting the synth on a port already used as the controller would loop it back on itself.
    if (this.controllerInput && this.controllerInput.id === this.input?.id) {
      this.setControllerInput(null)
    }
    this.notify()
  }

  setControllerInput(id: string | null): void {
    this.controllerInput = id ? (this.backend.inputs.find((p) => p.id === id) ?? null) : null
    settings.update({
      controllerInputId: this.controllerInput?.id ?? null,
      controllerInputName: this.controllerInput?.name ?? null,
    })
    this.notify()
  }

  setOutput(id: string | null): void {
    this.output = id ? (this.backend.outputs.find((p) => p.id === id) ?? null) : null
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

  /** The last error thrown by a send, surfaced so a silent failure becomes a visible one. */
  sendError: string | null = null

  send(data: Uint8Array | number[]): void {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const target = this.output?.id
    if (target === undefined) return
    try {
      this.backend.send(target, bytes)
    } catch (error) {
      // A sysex message sent under a grant that excluded sysex throws. Letting that propagate
      // would abort a whole parameter flush.
      const message = error instanceof Error ? error.message : String(error)
      if (this.sendError !== message) {
        this.sendError = message
        this.notify()
      }
      return
    }
    for (const fn of this.sentHandlers) fn(bytes)
  }

  /** Relay a performance message from the controller onto the synth's channel. */
  forwardToSynth(data: Uint8Array): void {
    if (!forwardable(data)) return
    this.send(remapChannel(data, this.channel))
  }

  /**
   * Send a message that carries a device ID, once per candidate until one is confirmed.
   *
   * This applies to everything device-addressed, not just requests. The ID defaults to the value
   * the factory files use and is only corrected once the instrument has been heard from, so on a
   * fresh origin an edit-buffer or program write addressed to the wrong ID is silently dropped by
   * the synth — while NRPN, which carries no device ID, keeps working and hides the problem.
   * The synth ignores anything addressed elsewhere, so the extra copies are harmless.
   */
  sendAddressed(build: (deviceId: number) => Uint8Array): void {
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
          model:
            MODEL_NAMES[decoded.familyId & 0x7f] ??
            `Unknown (0x${decoded.familyId.toString(16)})`,
        }
        this.device = info
        // The inquiry reply's family ID is a good guess at the sysex addressing ID but not proof:
        // they are different fields and the docs disagree about both. Only a Sequential message
        // actually sent by the instrument confirms which ID it answers on, so the fan-out stays
        // on until then rather than locking onto a value that may be silently ignored.
        if (isKnownDeviceId(info.deviceId) && !this.deviceIdConfirmed) this.deviceId = info.deviceId
        this.notify()
        resolve(info)
      })

      this.send(deviceInquiry())
    })
  }
}

export const connection = new MidiConnection()
