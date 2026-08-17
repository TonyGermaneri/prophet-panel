/**
 * Geometry constraints for the faceplate. These encode the things that look wrong when they break
 * — legends overhanging their frame, frames colliding, controls outside the plate — so they cannot
 * silently regress the next time the layout is nudged.
 */

import { describe, expect, it } from 'vitest'

import { KNOB, KNOBS, PLATE, SECTIONS, SWITCHES, SWITCH } from '../layout'

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

/** Clear space between neighbouring frames, matched in both directions. */
const MIN_GAP = 22
/** Clearance the printed scale must keep from the frame it sits in. */
const MIN_SCALE_CLEARANCE = 8

describe('section frames', () => {
  it('never overlap one another', () => {
    for (let i = 0; i < SECTIONS.length; i++) {
      for (let j = i + 1; j < SECTIONS.length; j++) {
        const a = SECTIONS[i]
        const b = SECTIONS[j]
        expect(overlaps(a.box, b.box), `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })

  it('keep a visible gap from their neighbours', () => {
    for (let i = 0; i < SECTIONS.length; i++) {
      for (let j = i + 1; j < SECTIONS.length; j++) {
        const a = SECTIONS[i].box
        const b = SECTIONS[j].box
        // Only frames that share a band need checking; distant ones are trivially clear.
        const verticallyAligned = a.y < bottom(b) && bottom(a) > b.y
        const horizontallyAligned = a.x < right(b) && right(a) > b.x
        const gap = verticallyAligned
          ? Math.max(b.x - right(a), a.x - right(b))
          : horizontallyAligned
            ? Math.max(b.y - bottom(a), a.y - bottom(b))
            : Infinity
        expect(gap, `${SECTIONS[i].id} to ${SECTIONS[j].id}`).toBeGreaterThanOrEqual(MIN_GAP)
      }
    }
  })

  it('sit inside the faceplate', () => {
    for (const { id, box } of SECTIONS) {
      expect(box.x, `${id} left`).toBeGreaterThanOrEqual(PLATE.x)
      expect(right(box), `${id} right`).toBeLessThanOrEqual(PLATE.x + PLATE.w)
      expect(box.y, `${id} top`).toBeGreaterThanOrEqual(PLATE.y)
      expect(bottom(box), `${id} bottom`).toBeLessThanOrEqual(PLATE.y + PLATE.h)
    }
  })
})

/** Widest legend on the panel, in units, at the 13.5px condensed face used for knob labels. */
const CHAR_WIDTH = 6.2

describe('control legends stay within their frame', () => {
  const frameFor = (x: number, y: number) =>
    SECTIONS.find(
      (s) => x >= s.box.x && x <= right(s.box) && y >= s.box.y && y <= bottom(s.box),
    )

  it('scale-end legends such as WHEEL-MOD LFO/NOISE do not overhang', () => {
    const extreme = KNOB.numberRadius * Math.SQRT1_2
    for (const knob of KNOBS) {
      if (!knob.endLabels) continue
      const frame = frameFor(knob.x, knob.y)
      expect(frame, `${knob.param} should sit in a section`).toBeDefined()

      // Left legend is right-anchored just outside the outermost scale number.
      const leftEdge = knob.x - (extreme + 5) - knob.endLabels[0].length * CHAR_WIDTH
      const rightEdge = knob.x + extreme + 5 + knob.endLabels[1].length * CHAR_WIDTH

      expect(leftEdge, `${knob.param} "${knob.endLabels[0]}"`).toBeGreaterThan(frame!.box.x)
      expect(rightEdge, `${knob.param} "${knob.endLabels[1]}"`).toBeLessThan(right(frame!.box))
    }
  })

  it('knob scales keep clear of their frame on every side', () => {
    // The topmost scale number sits a full numberRadius above the control centre, which is the
    // tightest point on the panel — this is what forces the frames to be taller than the sheet's.
    const GLYPH = 6
    for (const knob of KNOBS) {
      const frame = frameFor(knob.x, knob.y)
      if (!frame) continue // free-standing controls have no frame
      const clearance = {
        left: knob.x - KNOB.numberRadius - GLYPH / 2 - frame.box.x,
        right: right(frame.box) - (knob.x + KNOB.numberRadius + GLYPH / 2),
        top: knob.y - KNOB.numberRadius - GLYPH - frame.box.y,
      }
      for (const [side, value] of Object.entries(clearance)) {
        expect(value, `${knob.param} ${side}`).toBeGreaterThanOrEqual(MIN_SCALE_CLEARANCE)
      }
    }
  })

  it('switch bezels do not overhang their frame', () => {
    for (const sw of SWITCHES) {
      const frame = frameFor(sw.x, sw.y)
      if (!frame) continue
      const half = (sw.leds && sw.leds > 1 ? 50 : SWITCH.w) / 2
      expect(sw.x - half, sw.param).toBeGreaterThan(frame.box.x)
      expect(sw.x + half, sw.param).toBeLessThan(right(frame.box))
    }
  })
})
