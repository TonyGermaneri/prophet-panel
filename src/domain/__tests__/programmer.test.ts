/**
 * The programmer's counter.
 *
 * The instrument's display never shows a group above 5. Ten groups exist, but FACTORY chooses which
 * half of memory those five refer to. Counting 1-10 in the panel would leave it addressing a
 * different slot than the hardware as soon as GROUP SELECT was used, so these rules are pinned here
 * rather than left implicit in the button handlers.
 */

import { describe, expect, it } from 'vitest'

import { PatchStore } from '../../state/store'
import {
  displayGroup,
  GROUP_COUNT,
  GROUPS_PER_HALF,
  isFactoryGroup,
  nextGroupInHalf,
  toggleFactoryGroup,
} from '../patch'

const groups = Array.from({ length: GROUP_COUNT }, (_, i) => i)

describe('group display', () => {
  it('never counts past five', () => {
    for (const g of groups) {
      expect(displayGroup(g)).toBeGreaterThanOrEqual(1)
      expect(displayGroup(g)).toBeLessThanOrEqual(GROUPS_PER_HALF)
    }
  })

  it('shows the same digit for a slot and its factory counterpart', () => {
    for (const g of groups) {
      expect(displayGroup(g)).toBe(displayGroup(toggleFactoryGroup(g)))
    }
  })

  it('splits memory into a user half and a factory half', () => {
    expect(groups.filter((g) => !isFactoryGroup(g))).toEqual([0, 1, 2, 3, 4])
    expect(groups.filter(isFactoryGroup)).toEqual([5, 6, 7, 8, 9])
  })
})

describe('group select', () => {
  it('wraps at five and stays in the user half', () => {
    expect([0, 1, 2, 3, 4].map(nextGroupInHalf)).toEqual([1, 2, 3, 4, 0])
  })

  it('wraps at five and stays in the factory half', () => {
    expect([5, 6, 7, 8, 9].map(nextGroupInHalf)).toEqual([6, 7, 8, 9, 5])
  })

  it('walks the display 1..5 repeatedly, never reaching 6', () => {
    let group = 0
    const seen: number[] = []
    for (let i = 0; i < GROUP_COUNT * 2; i++) {
      seen.push(displayGroup(group))
      group = nextGroupInHalf(group)
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5])
  })

  it('returns to where it started after five presses', () => {
    for (const start of groups) {
      let group = start
      for (let i = 0; i < GROUPS_PER_HALF; i++) group = nextGroupInHalf(group)
      expect(group).toBe(start)
    }
  })
})

describe('factory', () => {
  it('keeps the displayed group and only swaps halves', () => {
    for (const g of groups) {
      const other = toggleFactoryGroup(g)
      expect(other).not.toBe(g)
      expect(isFactoryGroup(other)).toBe(!isFactoryGroup(g))
      expect(displayGroup(other)).toBe(displayGroup(g))
    }
  })

  it('is its own inverse', () => {
    for (const g of groups) expect(toggleFactoryGroup(toggleFactoryGroup(g))).toBe(g)
  })

  it('lamp follows the slot, however the slot was reached', () => {
    const store = new PatchStore()
    for (const g of groups) {
      store.setSlot(g, 0)
      expect(store.get('ui:factory')).toBe(isFactoryGroup(g) ? 1 : 0)
    }
  })

  it('lamp follows a slot the instrument chose, not just a button press', () => {
    const store = new PatchStore()
    // A program change arriving from the hardware lands in the factory half; the lamp has to light
    // without anyone touching FACTORY, or the panel would claim to be in the user half.
    store.setSlot(7, 12)
    expect(store.get('ui:factory')).toBe(1)
    expect(displayGroup(store.group)).toBe(3)
    store.setSlot(2, 12)
    expect(store.get('ui:factory')).toBe(0)
    expect(displayGroup(store.group)).toBe(3)
  })

  it('reaches every group when combined with group select', () => {
    const reached = new Set<number>()
    let group = 0
    for (let i = 0; i < GROUPS_PER_HALF; i++) {
      reached.add(group)
      reached.add(toggleFactoryGroup(group))
      group = nextGroupInHalf(group)
    }
    expect(reached.size).toBe(GROUP_COUNT)
  })
})
