/**
 * Geometry constraints for both faceplates. These encode the things that look wrong when they
 * break — legends overhanging their frame, frames colliding, controls outside the plate — so they
 * cannot silently regress the next time either layout is nudged.
 *
 * Both variants run the same checks, since both are measured from a reference image and both are
 * equally easy to knock out of true.
 */

import { describe, expect, it } from 'vitest'

import { KNOB, KNOBS, PLATE, SECTIONS, SWITCH, SWITCHES } from '../layout'
import {
  DESKTOP_KNOBS,
  DESKTOP_KNOB,
  DESKTOP_CASE,
  DESKTOP_SECTIONS,
  DESKTOP_SWITCH,
  DESKTOP_SWITCHES,
} from '../desktopLayout'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const right = (r: Rect) => r.x + r.w
const bottom = (r: Rect) => r.y + r.h

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y
}

const VARIANTS = [
  {
    name: 'keyboard',
    sections: SECTIONS,
    knobs: KNOBS,
    switches: SWITCHES,
    plate: PLATE,
    knob: KNOB,
    switchW: SWITCH.w,
    minGap: 22,
    minClearance: 8,
    glyph: 6,
  },
  {
    name: 'desktop',
    sections: DESKTOP_SECTIONS,
    knobs: DESKTOP_KNOBS,
    switches: DESKTOP_SWITCHES,
    plate: DESKTOP_CASE,
    knob: DESKTOP_KNOB,
    switchW: DESKTOP_SWITCH.w,
    minGap: 20,
    minClearance: 6,
    glyph: 8,
  },
]

describe.each(VARIANTS)('$name layout', (v) => {
  const frameFor = (x: number, y: number) =>
    v.sections.find(
      (s) => x >= s.box.x && x <= right(s.box) && y >= s.box.y && y <= bottom(s.box),
    )

  it('section frames never overlap one another', () => {
    for (let i = 0; i < v.sections.length; i++) {
      for (let j = i + 1; j < v.sections.length; j++) {
        expect(
          overlaps(v.sections[i].box, v.sections[j].box),
          `${v.sections[i].id} overlaps ${v.sections[j].id}`,
        ).toBe(false)
      }
    }
  })

  it('section frames keep a visible gap from their neighbours', () => {
    for (let i = 0; i < v.sections.length; i++) {
      for (let j = i + 1; j < v.sections.length; j++) {
        const a = v.sections[i].box
        const b = v.sections[j].box
        const sharesBand = a.y < bottom(b) && bottom(a) > b.y
        const sharesColumn = a.x < right(b) && right(a) > b.x
        const gap = sharesBand
          ? Math.max(b.x - right(a), a.x - right(b))
          : sharesColumn
            ? Math.max(b.y - bottom(a), a.y - bottom(b))
            : Infinity
        expect(gap, `${v.sections[i].id} to ${v.sections[j].id}`).toBeGreaterThanOrEqual(v.minGap)
      }
    }
  })

  it('section frames sit inside the faceplate', () => {
    for (const { id, box } of v.sections) {
      expect(box.x, `${id} left`).toBeGreaterThanOrEqual(v.plate.x)
      expect(right(box), `${id} right`).toBeLessThanOrEqual(v.plate.x + v.plate.w)
      expect(box.y, `${id} top`).toBeGreaterThanOrEqual(v.plate.y)
      expect(bottom(box), `${id} bottom`).toBeLessThanOrEqual(v.plate.y + v.plate.h)
    }
  })

  it('every control sits inside the faceplate', () => {
    for (const k of v.knobs) {
      expect(k.x - v.knob.numberRadius, k.param).toBeGreaterThan(v.plate.x)
      expect(k.x + v.knob.numberRadius, k.param).toBeLessThan(v.plate.x + v.plate.w)
    }
    for (const s of v.switches) {
      expect(s.x - v.switchW, s.param).toBeGreaterThan(v.plate.x)
      expect(s.x + v.switchW, s.param).toBeLessThan(v.plate.x + v.plate.w)
    }
  })

  it('knob scales keep clear of their frame on every side', () => {
    // The topmost scale number sits a full numberRadius above the control centre, which is the
    // tightest point on either panel.
    for (const knob of v.knobs) {
      const frame = frameFor(knob.x, knob.y)
      if (!frame) continue // free-standing controls have no frame
      const clearance = {
        left: knob.x - v.knob.numberRadius - v.glyph / 2 - frame.box.x,
        right: right(frame.box) - (knob.x + v.knob.numberRadius + v.glyph / 2),
        top: knob.y - v.knob.numberRadius - v.glyph - frame.box.y,
      }
      for (const [side, value] of Object.entries(clearance)) {
        expect(value, `${knob.param} ${side}`).toBeGreaterThanOrEqual(v.minClearance)
      }
    }
  })

  it('switch bezels do not overhang their frame', () => {
    for (const sw of v.switches) {
      const frame = frameFor(sw.x, sw.y)
      if (!frame) continue
      const half = ((sw.leds && sw.leds > 1 ? v.switchW * 1.3 : v.switchW) / 2) + 1
      expect(sw.x - half, sw.param).toBeGreaterThan(frame.box.x)
      expect(sw.x + half, sw.param).toBeLessThan(right(frame.box))
    }
  })

  it('covers the whole instrument: 28 knobs and 41 switches', () => {
    expect(v.knobs).toHaveLength(28)
    expect(v.switches).toHaveLength(41)
  })

  it('drives exactly the same controls as the other variant', () => {
    const ids = (list: { param: string }[]) => [...list.map((c) => c.param)].sort()
    const other = VARIANTS.find((o) => o.name !== v.name)!
    expect(ids(v.knobs)).toEqual(ids(other.knobs))
    expect(ids(v.switches)).toEqual(ids(other.switches))
  })
})
