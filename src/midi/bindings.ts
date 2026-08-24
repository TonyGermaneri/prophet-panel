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
import { platform } from '@platform'

import { describeCc } from './ccNames'
import { CC } from './nrpn'

export type BindingSource =
  | { kind: 'cc'; channel: number; number: number }
  | { kind: 'nrpn'; channel: number; number: number }
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
 * Control changes that carry NRPN traffic rather than a physical control. None of these is bindable
 * on its own — a single one is a fragment of a parameter message, not the knob that sent it. They
 * are assembled into an `nrpn` source instead, which is what makes a controller that speaks NRPN
 * (a Peak, a Hydrasynth, most modern synths acting as controllers) bindable at all.
 */
export const NRPN_CCS = new Set<number>([
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
    case 'nrpn':
      return `NRPN ${source.number} · ${ch}`
    case 'note':
      return `Note ${source.number} · ${ch}`
    case 'pitchbend':
      return `Pitch bend · ${ch}`
    case 'aftertouch':
      return `Aftertouch · ${ch}`
  }
}

/**
 * Assembles the four-message NRPN sequence a controller sends into one bindable source.
 *
 * Kept per port and stateful because that is what NRPN is: the parameter number is selected by one
 * pair of messages and the value arrives in another, and a device may select once and then send
 * values alone. Two senders have to be tolerated. Some send only the value's high byte — a Peak's
 * multi-state buttons do, with the state in it — and some put the whole value in the low byte with
 * a zero high byte, which is what this app's own encoder does. Emitting on either byte covers both,
 * at the cost of a coarse value landing first when a device sends the pair.
 */
export class NrpnSourceAssembler {
  private msb = 0
  private lsb = 0
  private value = 0
  private selected = false

  /** The completed source and value, or null while the sequence is still arriving. */
  feed(data: Uint8Array): { source: BindingSource; value: number } | null {
    if ((data[0] & 0xf0) !== 0xb0) return null
    const channel = data[0] & 0x0f
    const [, controller, value] = data

    switch (controller) {
      case CC.NrpnParamMsb:
        this.msb = value
        this.selected = true
        return null
      case CC.NrpnParamLsb:
        this.lsb = value
        this.selected = true
        return null
      case CC.DataEntryMsb:
        if (!this.selected) return null
        this.value = value
        return this.emit(channel, value)
      case CC.DataEntryLsb: {
        if (!this.selected) return null
        // A high byte of zero means the sender is using the low byte as the whole value.
        const combined = this.value === 0 ? value : (this.value << 7) | value
        return this.emit(channel, combined)
      }
      case CC.DataIncrement:
      case CC.DataDecrement:
        if (!this.selected) return null
        this.value = Math.max(0, this.value + (controller === CC.DataIncrement ? 1 : -1))
        return this.emit(channel, this.value)
      case CC.RpnParamLsb:
      case CC.RpnParamMsb:
        if (value === 0x7f) this.selected = false
        return null
      default:
        return null
    }
  }

  private emit(channel: number, value: number): { source: BindingSource; value: number } {
    return { source: { kind: 'nrpn', channel, number: (this.msb << 7) | this.lsb }, value }
  }
}

/** Read a bindable source out of a raw message, or null if this message is not bindable. */
export function parseSource(data: Uint8Array): { source: BindingSource; value: number } | null {
  const status = data[0] & 0xf0
  const channel = data[0] & 0x0f
  switch (status) {
    case 0xb0:
      // NRPN needs the sequence, not one message; the store assembles those separately.
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

/**
 * Map an incoming value onto a control's own range.
 *
 * A control change is 0-127 by definition, so it scales. An NRPN is not: it carries another
 * instrument's parameter at that instrument's own range, and a four-state button sends 0-3. Scaling
 * those against 0-127 would put every state of that button in the bottom three percent of the
 * target — off, for anything with two states. So an NRPN value is taken at face value and clamped,
 * which makes state N on the sending device select state N here.
 */
export function mapValue(controlId: string, value: number, kind: BindingSource['kind'] = 'cc'): number {
  const { min, max } = controlRange(controlId)
  if (kind === 'nrpn') return Math.max(min, Math.min(max, min + value))
  // A two-state control should snap rather than creep through the midpoint.
  if (max - min === 1) return value >= 64 ? max : min
  return Math.round(min + (value / 127) * (max - min))
}

function load(): Binding[] {
  try {
    const raw = platform.kv.get(KEY)
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
  /** One NRPN assembler per port: two controllers must not interleave into each other's state. */
  private assemblers = new Map<string, NrpnSourceAssembler>()

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
    const parsed = this.read(portId, data)
    if (!parsed) return 'ignored'

    if (this.active && this.selected) {
      this.bind(this.selected, portId, portName, parsed.source)
      return 'learned'
    }

    const matches = this.index.get(sourceKey(portId, parsed.source)) ?? []
    for (const binding of matches) this.apply(binding, parsed.value)
    return matches.length ? 'applied' : 'ignored'
  }

  /**
   * A message as a bindable source. NRPN needs the port's running sequence state, so it cannot be
   * read by a pure function the way a control change can.
   */
  private read(portId: string, data: Uint8Array): { source: BindingSource; value: number } | null {
    if ((data[0] & 0xf0) === 0xb0 && NRPN_CCS.has(data[1])) {
      let assembler = this.assemblers.get(portId)
      if (!assembler) {
        assembler = new NrpnSourceAssembler()
        this.assemblers.set(portId, assembler)
      }
      return assembler.feed(data)
    }
    return parseSource(data)
  }

  private apply(binding: Binding, value: number): void {
    const { min, max } = controlRange(binding.controlId)
    if (binding.source.kind === 'note') {
      // A pad or key acts like clicking the control: advance and wrap.
      const current = store.get(binding.controlId)
      store.set(binding.controlId, current >= max ? min : current + 1, 'ui')
      return
    }
    store.set(binding.controlId, mapValue(binding.controlId, value, binding.source.kind), 'ui')
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
      platform.kv.set(KEY, JSON.stringify(this.list))
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
