import { beforeEach, describe, expect, it } from 'vitest'

import { store } from '../../state/store'
import { BindingStore, describeSource, mapValue, parseSource } from '../bindings'
import { CC, encodeNrpn } from '../nrpn'

const SYNTH = 'synth-port'
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

    const consumed = bind.handle(CONTROLLER, 'Launch', cc(0, 74, 100), SYNTH)

    expect(consumed).toBe(true)
    expect(bind.bindings).toHaveLength(1)
    expect(bind.bindingFor('filterCutoff')?.source).toEqual({ kind: 'cc', channel: 0, number: 74 })
    // Selection clears so the next click starts a fresh binding.
    expect(bind.selected).toBeNull()
  })

  it('ignores the synth’s own port while learning', () => {
    bind.setActive(true)
    bind.select('filterCutoff')

    expect(bind.handle(SYNTH, 'Prophet', cc(0, 74, 100), SYNTH)).toBe(false)
    expect(bind.bindings).toHaveLength(0)
    expect(bind.selected).toBe('filterCutoff')
  })

  it('drives the bound control once learned', () => {
    bind.setActive(true)
    bind.select('filterCutoff')
    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 0), SYNTH)
    bind.setActive(false)

    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 127), SYNTH)
    expect(store.get('filterCutoff')).toBe(120)

    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 64), SYNTH)
    expect(store.get('filterCutoff')).toBe(60)
  })

  it('keeps bindings from different ports apart', () => {
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 74 })
    // The same CC from a different device must not move the control.
    bind.handle('other-port', 'Other', cc(0, 74, 127), SYNTH)
    expect(store.get('filterCutoff')).toBe(120 - 0) // unchanged from the init patch
    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 0), SYNTH)
    expect(store.get('filterCutoff')).toBe(0)
  })

  it('rebinding a control replaces its previous source', () => {
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 74 })
    bind.bind('filterCutoff', CONTROLLER, 'Launch', { kind: 'cc', channel: 0, number: 21 })

    expect(bind.bindings).toHaveLength(1)
    bind.handle(CONTROLLER, 'Launch', cc(0, 74, 0), SYNTH)
    expect(store.get('filterCutoff')).toBe(120) // old source no longer does anything
    bind.handle(CONTROLLER, 'Launch', cc(0, 21, 0), SYNTH)
    expect(store.get('filterCutoff')).toBe(0)
  })

  it('a pad advances a switch the way clicking it does', () => {
    bind.bind('filterKeyboardTrack', CONTROLLER, 'Pads', { kind: 'note', channel: 0, number: 36 })
    store.set('filterKeyboardTrack', 0, 'ui')

    const press = () => bind.handle(CONTROLLER, 'Pads', new Uint8Array([0x90, 36, 100]), SYNTH)
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
    reloaded.handle(CONTROLLER, 'Launch', cc(0, 74, 0), SYNTH)
    expect(store.get('filterCutoff')).toBe(0)
  })

  it('describes a source the way the panel lists it', () => {
    expect(describeSource({ kind: 'cc', channel: 0, number: 74 })).toBe('CC 74 · ch 1')
    expect(describeSource({ kind: 'pitchbend', channel: 3 })).toBe('Pitch bend · ch 4')
  })
})
