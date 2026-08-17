/**
 * Bridges the panel store and the instrument.
 *
 * Outbound: a knob move becomes an NRPN message, coalesced per parameter so repeated writes in one
 * task send once. The flush runs on a microtask, deliberately not on an animation frame: a hidden
 * tab stops receiving frames entirely, which would silently strand every panel edit and every
 * bound-controller move for as long as the window sat in the background — precisely when a hardware
 * controller is being used.
 *
 * Inbound: NRPN messages from the synth update the store with source 'midi', and sysex program or
 * edit-buffer dumps replace the whole patch. Store changes originating from MIDI or from a patch
 * load are not echoed back, which is what stops a feedback loop between the two panels.
 */

import { BY_ID, BY_NRPN, GLOBAL_BY_ID } from '../domain/parameters'
import { patchFromPayload, type Patch } from '../domain/patch'
import {
  decodeMessage,
  encodeEditBuffer,
  encodeProgramData,
  requestEditBuffer,
  requestProgram,
} from '../domain/sysex'
import { setPerformanceSink } from '../state/performance'
import type { ChangeSource, PatchStore } from '../state/store'
import type { MidiConnection } from './connection'
import {
  CC,
  encodeCC,
  encodeNoteOff,
  encodeNoteOn,
  encodeNrpn,
  encodePitchBend,
  encodeProgramChange,
  NrpnReceiver,
} from './nrpn'

/** Front-panel controls that are not program parameters but do have a MIDI meaning. */
const UI_CC: Record<string, number> = {
  'ui:volume': 7,
}

export interface SyncOptions {
  /** Fall back to CC when the synth's Param Rcv global is set to CC rather than NRPN. */
  useCC?: boolean
}

/**
 * Timers are taken from the global scope rather than `window` so the sync logic can be exercised
 * under fake timers in a plain Node test, without a DOM.
 */
const later = (fn: () => void, ms: number): number => setTimeout(fn, ms) as unknown as number
const cancel = (id: number): void => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)

export class SynthSync {
  private pending = new Map<number, number>()
  private flushQueued = false
  private receiver: NrpnReceiver
  private teardown: (() => void)[] = []
  private bulkFetching = false
  private pendingGroup: number | null = null
  private followTimer = 0
  private retryTimer = 0
  private awaitingDump = false

  /**
   * Follow program changes made on the instrument by pulling its edit buffer. Cheap — one small
   * request and one dump per patch change — so it is on by default.
   */
  follow = true

  constructor(
    private readonly connection: MidiConnection,
    private readonly store: PatchStore,
    private readonly options: SyncOptions = {},
  ) {
    this.receiver = new NrpnReceiver(({ nrpn, value }) => this.applyIncoming(nrpn, value))
  }

  start(): void {
    this.store.onChange = (id, value, source) => this.handleStoreChange(id, value, source)
    this.teardown.push(this.connection.onMessage((data) => this.handleIncoming(data)))
    setPerformanceSink({
      noteOn: (note, velocity) =>
        this.connection.send(encodeNoteOn(this.connection.channel, note, velocity)),
      noteOff: (note) => this.connection.send(encodeNoteOff(this.connection.channel, note)),
      pitchBend: (value) => this.connection.send(encodePitchBend(this.connection.channel, value)),
      modWheel: (value) => this.connection.send(encodeCC(this.connection.channel, 1, value)),
    })
    this.teardown.push(() => setPerformanceSink(null))
  }

  stop(): void {
    for (const fn of this.teardown) fn()
    this.teardown = []
    this.store.onChange = null
    this.pending.clear()
    cancel(this.followTimer)
    cancel(this.retryTimer)
    this.awaitingDump = false
  }

  // ---- outbound ----

  private handleStoreChange(id: string, value: number, source: ChangeSource): void {
    if (source !== 'ui') return

    const cc = UI_CC[id]
    if (cc !== undefined) {
      this.connection.send(encodeCC(this.connection.channel, cc, value))
      return
    }

    const p = BY_ID.get(id)
    if (!p) return
    this.pending.set(p.nrpn, value)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushQueued) return
    this.flushQueued = true
    // Microtasks are never throttled or paused, unlike frames and (in background tabs) timers.
    queueMicrotask(() => {
      this.flushQueued = false
      this.flush()
    })
  }

  private flush(): void {
    for (const [nrpn, value] of this.pending) {
      this.connection.send(this.encodeParam(nrpn, value))
    }
    this.pending.clear()
  }

  private encodeParam(nrpn: number, value: number): number[] {
    if (this.options.useCC) {
      const cc = BY_NRPN.get(nrpn)?.cc
      if (cc !== undefined) return encodeCC(this.connection.channel, cc, value)
    }
    return encodeNrpn(this.connection.channel, nrpn, value)
  }

  /** Push a global parameter (transpose, MIDI channel, pot mode, ...). */
  setGlobal(id: string, value: number): void {
    const p = GLOBAL_BY_ID.get(id)
    if (!p) throw new Error(`Unknown global: ${id}`)
    this.connection.send(encodeNrpn(this.connection.channel, p.nrpn, value))
  }

  // ---- inbound ----

  private handleIncoming(data: Uint8Array): void {
    if (data[0] === 0xf0) {
      // A bulk librarian fetch pulls forty programs at a time; those must land in the library,
      // not stomp whatever the player currently has on the panel.
      if (this.bulkFetching) return
      const decoded = decodeMessage(data)
      if (decoded?.kind === 'programData') {
        this.awaitingDump = false
        this.store.loadPatch(patchFromPayload(decoded.payload, decoded.group, decoded.program))
      } else if (decoded?.kind === 'editBuffer') {
        this.awaitingDump = false
        const patch = patchFromPayload(decoded.payload, this.store.group, this.store.program)
        this.store.loadPatch(patch)
      }
      return
    }

    // Selecting a patch on the instrument sends a program change, not a dump — the panel has to
    // notice the slot moved and go ask for the new sound itself.
    const status = data[0] & 0xf0
    if (status === 0xc0) {
      this.store.setSlot(this.pendingGroup ?? this.store.group, data[1])
      this.pendingGroup = null
      if (this.follow) this.pullEditBuffer()
      return
    }
    if (status === 0xb0 && data[1] === CC.BankSelect) {
      // Bank select precedes the program change; hold it until the program number arrives.
      this.pendingGroup = Math.max(0, data[2] - 1)
      return
    }

    this.receiver.feed(data)
  }

  /**
   * Ask for the edit buffer shortly after a program change, then once more if nothing came back.
   *
   * The delay matters: asking the instant the program change arrives can catch the synth
   * mid-load, and it answers with the outgoing patch or not at all. The retry covers the case
   * where the first request lands too early anyway.
   */
  private pullEditBuffer(): void {
    cancel(this.followTimer)
    cancel(this.retryTimer)
    this.awaitingDump = true

    this.followTimer = later(() => {
      this.requestEditBuffer()
      this.retryTimer = later(() => {
        if (this.awaitingDump) this.requestEditBuffer()
      }, 400)
    }, 150)
  }

  private applyIncoming(nrpn: number, value: number): void {
    const id = BY_NRPN.get(nrpn)?.id
    if (id) this.store.set(id, value, 'midi')
  }

  // ---- requests ----

  requestEditBuffer(): void {
    this.connection.sendRequest((id) => requestEditBuffer(id))
  }

  requestProgram(group: number, program: number): void {
    this.connection.sendRequest((id) => requestProgram(id, group, program))
  }

  /** Send the current panel state to the synth's edit buffer, for audition without storing it. */
  sendEditBuffer(patch: Patch = this.store.snapshot()): void {
    this.connection.send(encodeEditBuffer(this.connection.deviceId, patch.payload))
  }

  /** Write a patch into a numbered slot on the synth. */
  writeProgram(patch: Patch, group = patch.group, program = patch.program): void {
    this.connection.send(
      encodeProgramData(this.connection.deviceId, group, program, patch.payload),
    )
  }

  selectProgram(group: number, program: number): void {
    this.connection.send(encodeCC(this.connection.channel, CC.BankSelect, group + 1))
    this.connection.send(encodeProgramChange(this.connection.channel, program))
    // Same settle-then-ask path as a program change made on the instrument.
    if (this.follow) this.pullEditBuffer()
  }

  /**
   * Pull whole groups off the instrument. Requests are issued one at a time and each waits for its
   * dump, because a Prophet answering forty back-to-back requests will otherwise overrun.
   */
  async fetchGroups(
    groups: number[],
    onPatch: (patch: Patch) => void,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Patch[]> {
    const collected: Patch[] = []
    const total = groups.length * 40
    let done = 0

    this.bulkFetching = true
    try {
      for (const group of groups) {
        for (let program = 0; program < 40; program++) {
          const patch = await this.awaitProgram(group, program)
          done++
          onProgress?.(done, total)
          if (!patch) continue
          collected.push(patch)
          onPatch(patch)
        }
      }
    } finally {
      this.bulkFetching = false
    }
    return collected
  }

  private awaitProgram(group: number, program: number, timeoutMs = 600): Promise<Patch | null> {
    return new Promise((resolve) => {
      const timer = later(() => {
        stop()
        resolve(null)
      }, timeoutMs)

      const stop = this.connection.onMessage((data) => {
        const decoded = decodeMessage(data)
        if (decoded?.kind !== 'programData') return
        if (decoded.group !== group || decoded.program !== program) return
        cancel(timer)
        stop()
        resolve(patchFromPayload(decoded.payload, decoded.group, decoded.program))
      })

      this.requestProgram(group, program)
    })
  }
}
