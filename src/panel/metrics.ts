/**
 * Drawing metrics for a panel variant.
 *
 * The keyboard and desktop layouts are measured in their own reference images, which are different
 * sizes, so a knob is 28 units across in one and 34 in the other. Rather than rescale one layout
 * into the other's space — which would leave every measured coordinate a derived approximation —
 * the components read their metrics from context and each variant supplies its own.
 */

import { createContext, useContext } from 'react'

import { KNOB, SWITCH } from './layout'

export interface PanelMetrics {
  knob: {
    radius: number
    tickInner: number
    tickOuter: number
    numberRadius: number
    /** Degrees swept between minimum and maximum. */
    sweep: number
    /** How far the legend sits below the knob centre. */
    labelOffset: number
  }
  switchSize: { w: number; h: number }
  /**
   * 'moulded'    — dark plastic cap with a separate lamp above it (keyboard instrument)
   * 'illuminated'— translucent cap lit across its whole face (desktop module)
   */
  capStyle: 'moulded' | 'illuminated'
}

export const KEYBOARD_METRICS: PanelMetrics = {
  knob: { ...KNOB, labelOffset: 57 },
  switchSize: SWITCH,
  capStyle: 'moulded',
}

export const DESKTOP_METRICS: PanelMetrics = {
  knob: {
    radius: 34,
    tickInner: 39,
    tickOuter: 50,
    numberRadius: 62,
    sweep: 270,
    labelOffset: 69,
  },
  switchSize: { w: 47, h: 47 },
  capStyle: 'illuminated',
}

const MetricsContext = createContext<PanelMetrics>(KEYBOARD_METRICS)

export const MetricsProvider = MetricsContext.Provider

export function useMetrics(): PanelMetrics {
  return useContext(MetricsContext)
}
