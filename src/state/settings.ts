/**
 * Session settings that should survive a reload: which MIDI ports were chosen, the channel, and
 * panel preferences. Kept in localStorage rather than IndexedDB because they are tiny and needed
 * synchronously during startup.
 */

const KEY = 'prophet-panel:settings'

export interface Settings {
  inputId: string | null
  outputId: string | null
  /**
   * The performance controller: the port whose notes, CC and aftertouch are passed through to the
   * synth, and the only port MIDI Bind listens to. Kept separate from the synth's own ports.
   */
  controllerInputId: string | null
  /** Port names, so a remembered choice can be matched again when ids change between sessions. */
  inputName: string | null
  outputName: string | null
  controllerInputName: string | null
  channel: number
  follow: boolean
  hideKeyboard: boolean
  /**
   * Set once a connection has actually been established. Remembering the port ids is not enough
   * to reconnect on load: this records that the user has already granted MIDI access, which is
   * what makes an automatic reconnect silent rather than a surprise permission prompt.
   */
  hasConnected: boolean
}

const DEFAULTS: Settings = {
  inputId: null,
  outputId: null,
  controllerInputId: null,
  inputName: null,
  outputName: null,
  controllerInputName: null,
  channel: 0,
  follow: true,
  hideKeyboard: false,
  hasConnected: false,
}

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS }
  } catch {
    // A corrupt or unavailable store must not stop the app from starting.
    return { ...DEFAULTS }
  }
}

class SettingsStore {
  private value: Settings = read()
  private listeners = new Set<() => void>()

  get current(): Settings {
    return this.value
  }

  update(patch: Partial<Settings>): void {
    const next = { ...this.value, ...patch }
    if ((Object.keys(patch) as (keyof Settings)[]).every((k) => this.value[k] === next[k])) return
    this.value = next
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Private browsing and full quotas both throw; the setting still applies for this session.
    }
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const settings = new SettingsStore()
