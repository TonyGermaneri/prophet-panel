/**
 * Web MIDI transport.
 *
 * Sysex access needs `{ sysex: true }` and a secure context; the Vite dev server on localhost
 * qualifies, so no TLS is needed in development. Chrome and Edge implement this; Safari does not.
 */

import type { ConnectionState, MidiBackend, PortInfo, PortMessageHandler } from '../types'

export class WebMidiBackend implements MidiBackend {
  private access: MIDIAccess | null = null
  private handlers = new Set<PortMessageHandler>()
  private portHandlers = new Set<() => void>()

  sysexEnabled = false

  async open(): Promise<ConnectionState> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return 'unsupported'
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: true })
    } catch {
      return 'denied'
    }
    this.sysexEnabled = this.access.sysexEnabled !== false
    this.access.onstatechange = () => {
      // Ports appearing or disappearing must be (re)attached, or a device plugged in later would
      // never be heard by MIDI learn.
      this.listenToAllInputs()
      for (const fn of this.portHandlers) fn()
    }
    this.listenToAllInputs()
    return 'ready'
  }

  /**
   * Every input is listened to, not just the selected one, so MIDI learn can hear a controller
   * that is not the synth. Routing to the sync path is decided a layer up.
   */
  private listenToAllInputs(): void {
    for (const port of this.access?.inputs.values() ?? []) {
      port.onmidimessage = (e: MIDIMessageEvent) => {
        if (!e.data) return
        const data = new Uint8Array(e.data)
        const name = port.name ?? port.id
        for (const fn of this.handlers) fn(port.id, name, data)
      }
    }
  }

  get inputs(): PortInfo[] {
    return [...(this.access?.inputs.values() ?? [])].map((p) => ({ id: p.id, name: p.name ?? p.id }))
  }

  get outputs(): PortInfo[] {
    return [...(this.access?.outputs.values() ?? [])].map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
    }))
  }

  send(outputId: string, bytes: Uint8Array): void {
    // Web MIDI throws InvalidAccessError for a sysex message when access was granted without
    // sysex permission. That is left to propagate so it can be reported rather than lost.
    this.access?.outputs.get(outputId)?.send(Array.from(bytes))
  }

  onMessage(fn: PortMessageHandler): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  onPortsChanged(fn: () => void): () => void {
    this.portHandlers.add(fn)
    return () => this.portHandlers.delete(fn)
  }
}
