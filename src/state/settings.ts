/**
 * Session settings that should survive a reload: which MIDI ports were chosen, the channel, and
 * panel preferences. Kept in the key/value store rather than the patch database because they are
 * tiny and needed
 * synchronously during startup.
 */

import { DEFAULT_MODEL, type SynthModel } from '../domain/model'
import { platform } from '@platform'


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
  /** Where the library sits: a full-width strip under the header, or a column beside the panel. */
  libraryDock: 'header' | 'aside'
  /** How wide that column is, in pixels. Only meaningful in the `aside` dock. */
  libraryWidth: number
  /** Which of the two instruments the panel is dressed as. Presentation only. */
  model: SynthModel
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
  libraryDock: 'header',
  libraryWidth: 420,
  model: DEFAULT_MODEL,
  hasConnected: false,
}

function read(): Settings {
  try {
    const raw = platform.kv.get(KEY)
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
    platform.kv.set(KEY, JSON.stringify(next))
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const settings = new SettingsStore()
