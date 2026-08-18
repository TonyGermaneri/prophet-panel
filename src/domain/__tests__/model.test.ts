/**
 * The instrument the panel is dressed as.
 *
 * The point of these is that the choice stays cosmetic. The Prophet-5 and Prophet-10 Rev4 are the
 * same synthesizer twice, so the moment anything outside the chrome branches on the model there
 * are two panels to keep in step instead of one. The layout assertions below are what would catch
 * that drift.
 */

import { describe, expect, it } from 'vitest'

import { DESKTOP_KNOBS, DESKTOP_SWITCHES } from '../../panel/desktopLayout'
import { KNOBS, SWITCHES } from '../../panel/layout'
import { LOGO_ART } from '../../panel/logoPaths'
import {
  DEFAULT_MODEL,
  documentTitle,
  MODEL_IDS,
  modelName,
  otherModel,
  type SynthModel,
} from '../model'

describe('models', () => {
  it('defaults to the Prophet-10', () => {
    expect(DEFAULT_MODEL).toBe('prophet-10')
    expect(documentTitle(DEFAULT_MODEL)).toBe('Prophet-10 Control Panel')
  })

  it('names both instruments', () => {
    expect(MODEL_IDS).toEqual(['prophet-5', 'prophet-10'])
    expect(MODEL_IDS.map(modelName)).toEqual(['Prophet-5', 'Prophet-10'])
  })

  it('toggles between exactly the two, and back', () => {
    for (const id of MODEL_IDS) {
      expect(otherModel(id)).not.toBe(id)
      expect(otherModel(otherModel(id))).toBe(id)
      expect(MODEL_IDS).toContain(otherModel(id))
    }
  })

  it('falls back rather than blanking out if a stored value is unknown', () => {
    // localStorage holds whatever an older build wrote, so an id we no longer recognise has to
    // resolve to something printable instead of leaving the panel with no logo at all.
    const stale = 'prophet-600' as SynthModel
    expect(modelName(stale)).toBe('Prophet-10')
  })
})

describe('logo art', () => {
  it('carries artwork for every model', () => {
    for (const id of MODEL_IDS) {
      expect(LOGO_ART[id].paths.length).toBeGreaterThan(0)
      expect(LOGO_ART[id].paths.every((d) => d.startsWith('M'))).toBe(true)
    }
  })

  it('is one glyph wider for the Prophet-10, since 10 is two digits', () => {
    expect(LOGO_ART['prophet-10'].paths.length).toBe(LOGO_ART['prophet-5'].paths.length + 1)
  })

  it('presents the same cap height, so switching does not resize the logo', () => {
    // The two artboards differ; the viewBoxes are cropped to the measured ink so they do not.
    expect(LOGO_ART['prophet-10'].viewBox.height).toBe(LOGO_ART['prophet-5'].viewBox.height)
    expect(LOGO_ART['prophet-10'].viewBox.width).toBeGreaterThan(LOGO_ART['prophet-5'].viewBox.width)
  })
})

describe('the choice is cosmetic', () => {
  it('drives no control on either panel', () => {
    const controls = [...KNOBS, ...SWITCHES, ...DESKTOP_KNOBS, ...DESKTOP_SWITCHES]
    expect(controls.some((c) => /model|prophet/i.test(c.param))).toBe(false)
  })

  it('leaves both panels with identical control sets', () => {
    const ids = (list: { param: string }[]) => list.map((c) => c.param).sort()
    expect(ids([...DESKTOP_KNOBS, ...DESKTOP_SWITCHES])).toEqual(ids([...KNOBS, ...SWITCHES]))
  })
})
