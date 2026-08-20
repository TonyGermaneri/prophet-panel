import { beforeEach, describe, expect, it } from 'vitest'

import { store } from '../../state/store'
import { BindingStore, describeSource, mapValue, parseSource } from '../bindings'
import { forwardable, splitMessages } from '../forward'
import { CC, encodeNrpn } from '../nrpn'

const CONTROLLER = 'controller-port'

const cc = (channel: number, controller: number, value: number) =>
  new Uint8Array([0xb0 | channel, controller, value])

describe('parsing bindable sources', () => {
  it('reads control changes, notes, bend and pressure', () => {
    expect(parseSource(cc(0, 74, 40))?.source).toEqual({ kind: 'cc', channel: 0, number: 74 })
    expect(parseSource(new Uint8Array([0x91, 60, 100]))?.source).toEqual({
      kind: 'note',
      channel: 1,
      number: 60,
    })
    expect(parseSource(new Uint8Array([0xe0, 0, 64]))?.source).toEqual({
      kind: 'pitchbend',
      channel: 0,
    })
    expect(parseSource(new Uint8Array([0xd2, 80]))?.source).toEqual({
      kind: 'aftertouch',
      channel: 2,
    })
  })

  it('ignores note-off dressed as note-on', () => {
    expect(parseSource(new Uint8Array([0x90, 60, 0]))).toBeNull()
  })

  it('refuses to bind the control changes that carry NRPN', () => {
    // Binding one of these would capture a fragment of a parameter message, not a physical knob.
    for (const controller of [
      CC.NrpnParamMsb,
      CC.NrpnParamLsb,
      CC.DataEntryMsb,
      CC.DataEntryLsb,
      CC.BankSelect,
    ]) {
      expect(parseSource(cc(0, controller, 5)), `CC ${controller}`).toBeNull()
    }
    // A whole NRPN message yields nothing bindable.
    expect(parseSource(new Uint8Array(encodeNrpn(0, 17, 99)))).toBeNull()
  })

  it('scales pitch bend into the same 0-127 range as everything else', () => {
    expect(parseSource(new Uint8Array([0xe0, 0x7f, 0x7f]))?.value).toBe(127)
    expect(parseSource(new Uint8Array([0xe0, 0, 0]))?.value).toBe(0)
  })
})

describe('value mapping', () => {
  it('scales onto a control’s own range, which is rarely 0-127', () => {
    expect(mapValue('filterCutoff', 127)).toBe(120)
    expect(mapValue('filterCutoff', 0)).toBe(0)
    expect(mapValue('oscBFine', 127)).toBe(127)
  })

  it('snaps two-state controls instead of creeping through the middle', () => {
    expect(mapValue('oscASaw', 63)).toBe(0)
    expect(mapValue('oscASaw', 64)).toBe(1)
  })
})

describe('learning and applying', () => {
  let bind: BindingStore

  beforeEach(() => {
    localStorage.clear()
    bind = new BindingStore()
    store.reset()
  })

  it('binds the selected control to the next controller movement', () => {
    bind.setActive(true)
    bind.select('filterCutoff')

    expect(bind.handle(CONTROLLER, 'Launch', cc(0, 74, 100))).toBe('learned')
    expect(bind.bindings).toHaveLength(1)
    expect(bind.bindingFor('filterCutoff')?.source).toEqual({ kind: 'cc', channel: 0, number: 74 })
    // Selection clears so the next click starts a fresh binding.
    expect(bind.selected).toBeNull()
  })

  it('reports whether a message was claimed, so the caller can pass on what was not', () => {
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 74 })

    expect(bind.handle(CONTROLLER, 'Launch', cc(0, 74, 60))).toBe('applied')
    // An unbound control change is nobody's: the caller forwards it to the synth.
    expect(bind.handle(CONTROLLER, 'Launch', cc(0, 21, 60))).toBe('ignored')
    // So are notes, until one is bound to something.
    expect(bind.handle(CONTROLLER, 'Launch', new Uint8Array([0x90, 60, 100]))).toBe('ignored')
  })

  it('drives the bound control once learned', () => {
    bind.setActive(true)
    bind.select('filterCutoff')
    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 0))
    bind.setActive(false)

    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 127))
    expect(store.get('filterCutoff')).toBe(120)

    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 64))
    expect(store.get('filterCutoff')).toBe(60)
  })

  it('keeps bindings from different ports apart', () => {
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 74 })
    // The same CC from a different device must not move the control.
    bind.handle('other-port', 'Other', cc(0, 74, 127))
    expect(store.get('filterCutoff')).toBe(120 - 0) // unchanged from the init patch
    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 0))
    expect(store.get('filterCutoff')).toBe(0)
  })

  it('rebinding a control replaces its previous source', () => {
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 74 })
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 21 })

    expect(bind.bindings).toHaveLength(1)
    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 0))
    expect(store.get('filterCutoff')).toBe(120) // old source no longer does anything
    bind.handle(CONTROLLER, 'Launch', cc(0, 21, 0))
    expect(store.get('filterCutoff')).toBe(0)
  })

  it('a pad advances a switch the way clicking it does', () => {
    bind.bind('filterKeyboardTrack', CONTROLLER, 'Pads', { kind: 'note', channel: 0, number: 36 })
    store.set('filterKeyboardTrack', 0, 'ui')

    const press = () => bind.handle(CONTROLLER, 'Pads', new Uint8Array([0x90, 36, 100]))
    press()
    expect(store.get('filterKeyboardTrack')).toBe(1)
    press()
    expect(store.get('filterKeyboardTrack')).toBe(2)
    press()
    expect(store.get('filterKeyboardTrack')).toBe(0) // wraps
  })

  it('removes and clears', () => {
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 74 })
    bind.bind('filterResonance', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 75 })

    bind.remove('filterCutoff')
    expect(bind.bindings).toHaveLength(1)
    bind.clear()
    expect(bind.bindings).toHaveLength(0)
  })

  it('survives a reload', () => {
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 74 })
    const reloaded = new BindingStore()
    expect(reloaded.bindings).toHaveLength(1)
    reloaded.handle(CONTROLLER, 'Launch', cc(0, 74, 0))
    expect(store.get('filterCutoff')).toBe(0)
  })

  it('describes a source the way the panel lists it', () => {
    // Named as well as numbered, since a bare number identifies nothing on a row of like knobs.
    expect(describeSource({ kind: 'cc', channel: 0, number: 74 })).toBe('Brightness · CC 74 · ch 1')
    expect(describeSource({ kind: 'pitchbend', channel: 3 })).toBe('Pitch bend · ch 4')
  })

  it('leaves a control change the spec does not define as a bare number', () => {
    expect(describeSource({ kind: 'cc', channel: 0, number: 20 })).toBe('CC 20 · ch 1')
  })
})

/**
 * The controller routing as App wires it: every message in the buffer is offered to the bindings,
 * and only what nothing claims is passed on to the synth.
 *
 * This is where the reported bug lived. A knob sending a high-resolution pair binds on its coarse
 * half, and the fine half — an unclaimed control change — was relayed straight to an instrument
 * that reads fifty-seven CC numbers as parameter writes. Moving one bound knob toggled a Wheel-Mod
 * destination on the synth, which then reported the change back and lit the panel's lamp.
 */
describe('what reaches the synth from the controller', () => {
  const PORT = 'controller-1'
  /** A 14-bit pair: coarse on CC 22, fine on CC 54 — which is Wheel-Mod Freq A on this synth. */
  const COARSE = 22
  const FINE = 54

  const route = (bind: BindingStore, data: Uint8Array): number[][] => {
    const sent: number[][] = []
    for (const message of splitMessages(data)) {
      if (bind.handle(PORT, 'Knobs', message) === 'ignored' && forwardable(message)) {
        sent.push([...message])
      }
    }
    return sent
  }

  it('never relays the fine half onto a parameter the player did not touch', () => {
    const bind = new BindingStore()
    bind.clear()
    bind.bind('filterCutoff', PORT, 'Knobs', { kind: 'cc', channel: 0, number: COARSE })

    const sent = route(bind, new Uint8Array([0xb0, COARSE, 100, 0xb0, FINE, 127]))

    expect(sent).toEqual([])
    expect(store.get('filterCutoff')).toBe(94)
    // The switch the fine half would have flipped on the instrument.
    expect(store.get('wheelFreqA')).toBe(0)
  })

  it('applies a bound message even when an unbound one leads the buffer', () => {
    const bind = new BindingStore()
    bind.clear()
    store.set('filterCutoff', 0, 'patch')
    bind.bind('filterCutoff', PORT, 'Knobs', { kind: 'cc', channel: 0, number: 74 })

    // Judging the buffer by its first message would have missed the binding entirely.
    route(bind, new Uint8Array([0xb0, 1, 20, 0xb0, 74, 127]))
    expect(store.get('filterCutoff')).toBe(120)
  })

  it('still passes the wheels and pedals through', () => {
    const bind = new BindingStore()
    bind.clear()
    const sent = route(bind, new Uint8Array([0xb0, 1, 90, 0xb0, 64, 127, 0x90, 60, 100]))
    expect(sent).toEqual([
      [0xb0, 1, 90],
      [0xb0, 64, 127],
      [0x90, 60, 100],
    ])
  })
})
