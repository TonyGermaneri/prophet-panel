/**
 * The panel store.
 *
 * A patch's 133-byte payload is the source of truth; controls read and write it through here.
 * Subscriptions are per-parameter rather than global so that dragging one knob re-renders one
 * knob, not sixty — which matters when a drag emits a value every animation frame.
 *
 * Controls whose id starts with `ui:` (volume, master tune, transport buttons) are not part of a
 * program and live in a separate map.
 */

import { BY_ID, type Parameter } from '../domain/parameters'
import {
  clonePatch,
  emptyPayload,
  getParam,
  initPatch,
  type Patch,
  readName,
  setParam,
  writeName,
} from '../domain/patch'

export type ChangeSource = 'ui' | 'midi' | 'patch'

/** The instrument's program memory: ten groups of five banks of eight. */
export const GROUP_COUNT = 10
export const PROGRAMS_PER_GROUP = 40

export interface UiControl {
  id: string
  min: number
  max: number
  initial: number
}

/** Front-panel controls that are not stored in a program. */
export const UI_CONTROLS: UiControl[] = [
  { id: 'ui:volume', min: 0, max: 120, initial: 100 },
  { id: 'ui:masterTune', min: 0, max: 120, initial: 60 },
  { id: 'ui:a440', min: 0, max: 1, initial: 0 },
  { id: 'ui:velocity', min: 0, max: 3, initial: 0 },
  { id: 'ui:aftertouch', min: 0, max: 3, initial: 0 },
  { id: 'ui:tune', min: 0, max: 1, initial: 0 },
  { id: 'ui:preset', min: 0, max: 1, initial: 1 },
  { id: 'ui:record', min: 0, max: 1, initial: 0 },
  { id: 'ui:factory', min: 0, max: 1, initial: 0 },
  { id: 'ui:groupSelect', min: 0, max: 1, initial: 0 },
  { id: 'ui:bankSelect', min: 0, max: 1, initial: 0 },
  { id: 'ui:globals', min: 0, max: 3, initial: 0 },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `ui:program${i + 1}`,
    min: 0,
    max: 1,
    initial: 0,
  })),
]

const UI_BY_ID = new Map(UI_CONTROLS.map((c) => [c.id, c]))

export function controlRange(id: string): { min: number; max: number } {
  const p = BY_ID.get(id)
  if (p) return { min: p.min, max: p.max }
  const ui = UI_BY_ID.get(id)
  if (ui) return { min: ui.min, max: ui.max }
  return { min: 0, max: 127 }
}

export type ParamListener = (value: number, source: ChangeSource) => void

export class PatchStore {
  private patch: Patch = initPatch()
  private ui = new Map<string, number>(UI_CONTROLS.map((c) => [c.id, c.initial]))
  private listeners = new Map<string, Set<ParamListener>>()
  private metaListeners = new Set<() => void>()

  /** Notified for every parameter write, so the MIDI layer can mirror UI edits to the synth. */
  onChange: ((id: string, value: number, source: ChangeSource) => void) | null = null

  get current(): Patch {
    return this.patch
  }

  get(id: string): number {
    const p = BY_ID.get(id)
    if (p) return getParam(this.patch.payload, p)
    return this.ui.get(id) ?? 0
  }

  set(id: string, value: number, source: ChangeSource = 'ui'): void {
    const p = BY_ID.get(id)
    const next = this.coerce(id, value, p)
    if (this.get(id) === next) return

    if (p) setParam(this.patch.payload, p, next)
    else this.ui.set(id, next)

    this.emit(id, next, source)
  }

  private coerce(id: string, value: number, p: Parameter | undefined): number {
    const { min, max } = p ? { min: p.min, max: p.max } : controlRange(id)
    return Math.max(min, Math.min(max, Math.round(value)))
  }

  private emit(id: string, value: number, source: ChangeSource): void {
    for (const fn of this.listeners.get(id) ?? []) fn(value, source)
    if (source !== 'patch') this.onChange?.(id, value, source)
  }

  subscribe(id: string, fn: ParamListener): () => void {
    let set = this.listeners.get(id)
    if (!set) {
      set = new Set()
      this.listeners.set(id, set)
    }
    set.add(fn)
    return () => set!.delete(fn)
  }

  subscribeMeta(fn: () => void): () => void {
    this.metaListeners.add(fn)
    return () => this.metaListeners.delete(fn)
  }

  get name(): string {
    return this.patch.name
  }
  get group(): number {
    return this.patch.group
  }
  get program(): number {
    return this.patch.program
  }

  setName(name: string): void {
    writeName(this.patch.payload, name)
    this.patch.name = readName(this.patch.payload)
    this.notifyMeta()
  }

  /**
   * The instrument has ten groups of forty programs. A program change or bank select arriving over
   * MIDI carries a full 7-bit value, so without clamping the panel can be pushed to a slot that
   * cannot exist and the header ends up displaying a number for nothing.
   */
  setSlot(group: number, program: number): void {
    this.patch = {
      ...this.patch,
      group: Math.max(0, Math.min(GROUP_COUNT - 1, Math.round(group))),
      program: Math.max(0, Math.min(PROGRAMS_PER_GROUP - 1, Math.round(program))),
    }
    this.notifyMeta()
  }

  /**
   * Replace the whole patch. Emits per-parameter changes so every control refreshes, with source
   * 'patch' so the MIDI layer does not echo 60 messages back at the synth that just sent them.
   */
  loadPatch(patch: Patch): void {
    const previous = this.patch
    this.patch = clonePatch(patch)
    for (const id of BY_ID.keys()) {
      const p = BY_ID.get(id)!
      const before = getParam(previous.payload, p)
      const after = getParam(this.patch.payload, p)
      if (before !== after) this.emit(id, after, 'patch')
    }
    this.notifyMeta()
  }

  /** Reset to the init program. */
  reset(): void {
    this.loadPatch(initPatch())
  }

  /** A snapshot safe to hand to the librarian or the sysex encoder. */
  snapshot(): Patch {
    return clonePatch(this.patch)
  }

  private notifyMeta(): void {
    for (const fn of this.metaListeners) fn()
  }
}

export const store = new PatchStore()

export { emptyPayload }
