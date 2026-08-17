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

/** Minimum clear space between neighbouring frames, in panel units (~5 screen px when rendered). */
const MIN_GAP = 8

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

  it('knob scales do not overhang their frame', () => {
    for (const knob of KNOBS) {
      const frame = frameFor(knob.x, knob.y)
      if (!frame) continue // free-standing controls have no frame
      expect(knob.x - KNOB.numberRadius, knob.param).toBeGreaterThan(frame.box.x)
      expect(knob.x + KNOB.numberRadius, knob.param).toBeLessThan(right(frame.box))
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
