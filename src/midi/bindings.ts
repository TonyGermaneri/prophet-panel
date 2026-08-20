/**
 * MIDI learn: bind a control on any connected controller to a control on the software panel.
 *
 * A bound message writes to the panel store exactly as a mouse drag would, with source 'ui', so
 * the change flows straight on to the hardware Prophet through the normal sync path. That is what
 * makes an outside controller drive the synth without any special-case plumbing.
 *
 * Only the port chosen as the performance controller is fed in here, which is what keeps the
 * Prophet's own transmissions from being captured while reaching for a knob on a controller.
 */

import { controlRange, store } from '../state/store'
import { describeCc } from './ccNames'
import { CC } from './nrpn'

export type BindingSource =
  | { kind: 'cc'; channel: number; number: number }
  | { kind: 'note'; channel: number; number: number }
  | { kind: 'pitchbend'; channel: number }
  | { kind: 'aftertouch'; channel: number }

/**
 * What became of a message. 'ignored' is the signal to the caller that nothing claimed it, so it
 * is free to pass the message through to the synth as performance data.
 */
export type BindingResult = 'learned' | 'applied' | 'ignored'

export interface Binding {
  controlId: string
  portId: string
  portName: string
  source: BindingSource
}

const KEY = 'prophet-panel:bindings'

/**
 * Control changes that carry NRPN traffic rather than a physical control. Binding one of these
 * would capture a fragment of a parameter message instead of the knob that sent it.
 */
const NRPN_CCS = new Set<number>([
  CC.NrpnParamMsb,
  CC.NrpnParamLsb,
  CC.DataEntryMsb,
  CC.DataEntryLsb,
  CC.DataIncrement,
  CC.DataDecrement,
  CC.RpnParamMsb,
  CC.RpnParamLsb,
  CC.BankSelect,
])

export function sourceKey(portId: string, source: BindingSource): string {
  const number = 'number' in source ? source.number : 0
  return `${portId}|${source.kind}|${source.channel}|${number}`
}

export function describeSource(source: BindingSource): string {
  const ch = `ch ${source.channel + 1}`
  switch (source.kind) {
    case 'cc':
      // Named as well as numbered: a bare number identifies nothing on a row of identical knobs.
      return `${describeCc(source.number)} · ${ch}`
    case 'note':
      return `Note ${source.number} · ${ch}`
    case 'pitchbend':
      return `Pitch bend · ${ch}`
    case 'aftertouch':
      return `Aftertouch · ${ch}`
  }
}

/** Read a bindable source out of a raw message, or null if this message is not bindable. */
export function parseSource(data: Uint8Array): { source: BindingSource; value: number } | null {
  const status = data[0] & 0xf0
  const channel = data[0] & 0x0f
  switch (status) {
    case 0xb0:
      if (NRPN_CCS.has(data[1])) return null
      return { source: { kind: 'cc', channel, number: data[1] }, value: data[2] }
    case 0x90:
      if (data[2] === 0) return null
      return { source: { kind: 'note', channel, number: data[1] }, value: data[2] }
    case 0xe0:
      // 14-bit, scaled down so every source hands the mapper the same 0-127 range.
      return { source: { kind: 'pitchbend', channel }, value: ((data[2] << 7) | data[1]) >> 7 }
    case 0xd0:
      return { source: { kind: 'aftertouch', channel }, value: data[1] }
    default:
      return null
  }
}

/** Map a 0-127 controller value onto a control's own range. */
export function mapValue(controlId: string, value: number): number {
  const { min, max } = controlRange(controlId)
  // A two-state control should snap rather than creep through the midpoint.
  if (max - min === 1) return value >= 64 ? max : min
  return Math.round(min + (value / 127) * (max - min))
}

function load(): Binding[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Binding[]) : []
  } catch {
    return []
  }
}

export class BindingStore {
  /** Bind mode: clicking a panel control selects it for binding instead of operating it. */
  active = false
  /** The control awaiting a controller movement, if any. */
  selected: string | null = null
  /** The most recent binding made, so the UI can confirm what was captured. */
  lastBound: Binding | null = null

  private list: Binding[] = load()
  private index = new Map<string, Binding[]>()
  private listeners = new Set<() => void>()
  private version = 0

  constructor() {
    this.reindex()
  }

  get bindings(): readonly Binding[] {
    return this.list
  }

  /** Changes on every mutation so useSyncExternalStore can compare cheaply. */
  get revision(): number {
    return this.version
  }

  setActive(active: boolean): void {
    this.active = active
    if (!active) this.selected = null
    this.changed(false)
  }

  select(controlId: string | null): void {
    this.selected = controlId
    this.changed(false)
  }

  /**
   * Handle a message from the performance controller. While a control is selected the next
   * movement binds it; otherwise any matching bindings apply.
   */
  handle(portId: string, portName: string, data: Uint8Array): BindingResult {
    const parsed = parseSource(data)
    if (!parsed) return 'ignored'

    if (this.active && this.selected) {
      this.bind(this.selected, portId, portName, parsed.source)
      return 'learned'
    }

    const matches = this.index.get(sourceKey(portId, parsed.source)) ?? []
    for (const binding of matches) this.apply(binding, parsed.value)
    return matches.length ? 'applied' : 'ignored'
  }

  private apply(binding: Binding, value: number): void {
    const { min, max } = controlRange(binding.controlId)
    if (binding.source.kind === 'note') {
      // A pad or key acts like clicking the control: advance and wrap.
      const current = store.get(binding.controlId)
      store.set(binding.controlId, current >= max ? min : current + 1, 'ui')
      return
    }
    store.set(binding.controlId, mapValue(binding.controlId, value), 'ui')
  }

  bind(controlId: string, portId: string, portName: string, source: BindingSource): void {
    const key = sourceKey(portId, source)
    // One physical control drives one panel control: rebinding replaces rather than stacks.
    this.list = this.list.filter(
      (b) => !(sourceKey(b.portId, b.source) === key) && b.controlId !== controlId,
    )
    const binding: Binding = { controlId, portId, portName, source }
    this.list.push(binding)
    this.lastBound = binding
    this.selected = null
    this.changed(true)
  }

  remove(controlId: string): void {
    this.list = this.list.filter((b) => b.controlId !== controlId)
    this.changed(true)
  }

  clear(): void {
    this.list = []
    this.lastBound = null
    this.changed(true)
  }

  bindingFor(controlId: string): Binding | undefined {
    return this.list.find((b) => b.controlId === controlId)
  }

  private reindex(): void {
    this.index = new Map()
    for (const binding of this.list) {
      const key = sourceKey(binding.portId, binding.source)
      const existing = this.index.get(key) ?? []
      existing.push(binding)
      this.index.set(key, existing)
    }
  }

  private changed(persist: boolean): void {
    if (persist) {
      this.reindex()
      try {
        localStorage.setItem(KEY, JSON.stringify(this.list))
      } catch {
        // Persistence is best-effort; the bindings still work for this session.
      }
    }
    this.version++
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const bindings = new BindingStore()
