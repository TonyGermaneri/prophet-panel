/**
 * MIDI through the native shell.
 *
 * The host's MIDI stream arrives as one more input port, named "DAW / Host", which is what lets a
 * DAW track play the Prophet without the app knowing a DAW exists — it is just another controller
 * as far as the panel is concerned.
 */

import type { ConnectionState, MidiBackend, PortInfo, PortMessageHandler } from '../types'
import { call, fromBase64, listen, toBase64 } from './bridge'

interface PortsPayload {
  inputs: PortInfo[]
  outputs: PortInfo[]
}

interface OpenPayload extends PortsPayload {
  state: ConnectionState
  sysexEnabled: boolean
}

interface IncomingMessage {
  port: string
  name: string
  data: string
}

export class NativeMidiBackend implements MidiBackend {
  sysexEnabled = true

  private inputList: PortInfo[] = []
  private outputList: PortInfo[] = []
  private handlers = new Set<PortMessageHandler>()
  private portHandlers = new Set<() => void>()
  private attached = false

  async open(): Promise<ConnectionState> {
    const result = (await call('midiOpen')) as OpenPayload
    this.inputList = result.inputs ?? []
    this.outputList = result.outputs ?? []
    this.sysexEnabled = result.sysexEnabled !== false

    // Connecting more than once is normal — the app connects on mount and the settings dialog
    // offers a retry — so the listeners are attached only the first time.
    if (!this.attached) {
      this.attached = true

      listen('pp:midi', (payload) => {
        // One event carries a tick's worth of messages, so a bulk dump does not cross the bridge
        // thousands of times.
        for (const message of (payload as IncomingMessage[] | null) ?? []) {
          const data = fromBase64(message.data)
          for (const fn of this.handlers) fn(message.port, message.name, data)
        }
      })

      listen('pp:ports', (payload) => {
        const ports = payload as PortsPayload | null
        this.inputList = ports?.inputs ?? []
        this.outputList = ports?.outputs ?? []
        for (const fn of this.portHandlers) fn()
      })
    }

    return result.state ?? 'ready'
  }

  get inputs(): PortInfo[] {
    return this.inputList
  }

  get outputs(): PortInfo[] {
    return this.outputList
  }

  send(outputId: string, bytes: Uint8Array): void {
    void call('midiSend', outputId, toBase64(bytes))
  }

  onMessage(fn: PortMessageHandler): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  onPortsChanged(fn: () => void): () => void {
    this.portHandlers.add(fn)
    return () => this.portHandlers.delete(fn)
  }

  onError(fn: (message: string) => void): () => void {
    return listen('pp:midiError', (payload) => fn(String(payload ?? 'MIDI send failed')))
  }
}
