/**
 * Naming control changes.
 *
 * The point of the table is that a binding row says which knob sent the message, so the cases that
 * matter are the ones where a name would be invented rather than known: the undefined ranges every
 * cheap controller uses, and the fine halves that are only meaningful in pairs.
 */

import { describe, expect, it } from 'vitest'

import { ccName, describeCc } from '../ccNames'

describe('ccName', () => {
  it('names the controllers the spec defines', () => {
    expect(ccName(1)).toBe('Modulation Wheel')
    expect(ccName(7)).toBe('Channel Volume')
    expect(ccName(64)).toBe('Sustain Pedal')
    expect(ccName(74)).toBe('Brightness')
    expect(ccName(127)).toBe('Poly Mode On')
  })

  it('names a fine half from its coarse partner, marked as the half it is', () => {
    expect(ccName(33)).toBe('Modulation Wheel LSB')
    expect(ccName(39)).toBe('Channel Volume LSB')
  })

  it('leaves the undefined ranges unnamed rather than guessing', () => {
    // These are exactly where a controller with no opinion tends to land.
    for (const number of [3, 9, 14, 15, 20, 31, 102, 119]) expect(ccName(number)).toBeUndefined()
    // 3 is undefined, so its fine half has nothing to be the half of.
    expect(ccName(35)).toBeUndefined()
  })

  it('rejects anything that is not a control change number', () => {
    for (const number of [-1, 128, 1.5, NaN]) expect(ccName(number)).toBeUndefined()
  })
})

describe('describeCc', () => {
  it('carries the number even when there is a name for it', () => {
    expect(describeCc(74)).toBe('Brightness · CC 74')
  })

  it('falls back to the number alone', () => {
    expect(describeCc(20)).toBe('CC 20')
  })
})
