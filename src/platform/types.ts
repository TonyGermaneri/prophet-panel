/**
 * The platform seam.
 *
 * The panel, the sysex codec and the sync bridge are the same code wherever this app runs. What
 * differs is how bytes reach the instrument, where settings and patches are kept, and how files
 * leave the app. Those concerns are named here and implemented twice: once against the browser,
 * once against the native shell that hosts the plugin's WebView.
 *
 * Consumers import from `@platform`, which the build aliases to the right implementation. Nothing
 * outside this directory should reach for `navigator`, `localStorage` or `indexedDB` directly.
 */

export interface PortInfo {
  id: string
  name: string
}

export type ConnectionState = 'idle' | 'unsupported' | 'denied' | 'ready'

export type PortMessageHandler = (portId: string, portName: string, data: Uint8Array) => void

/**
 * Raw MIDI transport: ports in, bytes out, messages back.
 *
 * Everything above this line — device ID discovery, port restoration by name, forwarding, NRPN
 * coalescing — is platform-independent and stays in `MidiConnection`. This interface is
 * deliberately the smallest thing that cannot be written portably.
 */
export interface MidiBackend {
  open(): Promise<ConnectionState>
  /** Whether sysex is actually permitted. The browser can grant access without it. */
  readonly sysexEnabled: boolean
  readonly inputs: PortInfo[]
  readonly outputs: PortInfo[]
  /**
   * Throws on failure rather than swallowing it: a sysex send under a non-sysex grant must become
   * a visible error, which is `MidiConnection`'s job to report.
   */
  send(outputId: string, bytes: Uint8Array): void
  /** Traffic from every input, tagged with its port, so MIDI learn can hear a controller. */
  onMessage(fn: PortMessageHandler): () => void
  /** Ports appearing or disappearing, so a device plugged in later is picked up. */
  onPortsChanged(fn: () => void): () => void
}

/**
 * Small synchronous store for settings, bindings and library sources.
 *
 * Synchronous is a requirement, not a convenience: settings are read during module initialisation,
 * before React mounts. The plugin satisfies it by having the native side inject a snapshot into
 * the page before any script runs, so reads hit memory and only writes cross the bridge.
 */
export interface KeyValueStore {
  get(key: string): string | null
  set(key: string, value: string): void
}

/**
 * The patch the panel is holding, kept with the host's own session document.
 *
 * Only a plugin has one of these. A plugin editor is destroyed every time the user closes its
 * window and rebuilt from nothing when they reopen it, so without somewhere to put the current
 * sound, closing the panel would silently discard it.
 */
export interface SessionStore {
  get(): Uint8Array | null
  set(payload: Uint8Array): void
}

export interface Platform {
  /** Which shell this is. Used to gate things that only make sense in one of them. */
  readonly name: 'web' | 'plugin'
  readonly midi: MidiBackend
  readonly kv: KeyValueStore
  /** Hand bytes to the user as a file. */
  saveFile(name: string, bytes: Uint8Array, type?: string): void
  /** Absent in the browser, where the page's own lifetime is the session. */
  readonly session?: SessionStore
}
