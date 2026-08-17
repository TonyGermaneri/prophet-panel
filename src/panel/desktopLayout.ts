/**
 * Geometry for the desktop module, in the coordinate space of reference/desktop.png (3410 x 1210).
 *
 * Same instrument, different furniture: four rows instead of three, the modulation sections moved
 * to the top, the logo printed straight onto the plate, and wood only on the two end cheeks.
 *
 * Derived the same way as the keyboard panel rather than eyeballed — Hough circles found exactly
 * the instrument's 28 knobs, contour detection the nine section frames, and a hue mask the
 * illuminated switch caps, with the remaining dark caps measured individually.
 *
 * The control ids are identical to the keyboard layout, so every component, binding and parameter
 * lookup works unchanged; only the positions differ.
 */

import type { BracketLayout, Box, KnobLayout, SectionLayout, SwitchLayout } from './layout'
import type { PanelAction } from '../state/actions'

export const DESKTOP_PANEL = { width: 3410, height: 1232 }

/**
 * The case is a metal wrap: it carries the controls and closes the top and bottom itself, so no
 * wood shows along either edge. The cheeks are separate blocks bolted to the ends, and they stand
 * proud of the metal — a little above it and noticeably below, forming feet.
 */
export const DESKTOP_CASE: Box = { x: 94, y: 21, w: 3223, h: 1154 }

export const DESKTOP_CHEEKS: Box[] = [
  { x: 20, y: 14, w: 76, h: 1198 },
  { x: 3311, y: 14, w: 76, h: 1198 },
]

/** Printed straight onto the plate, with no metal nameplate behind it. */
export const DESKTOP_LOGO: Box = { x: 2534, y: 173, w: 714, h: 117 }

/** Knob metrics scale with this panel's larger drawing space. */
export const DESKTOP_KNOB = {
  radius: 34,
  tickInner: 39,
  tickOuter: 50,
  numberRadius: 62,
  sweep: 270,
}

export const DESKTOP_SWITCH = { w: 47, h: 47 }

export const DESKTOP_SECTIONS: SectionLayout[] = [
  { id: 'lfo', title: 'LFO', box: { x: 124, y: 123, w: 743, h: 215 } },
  { id: 'wheelMod', title: 'WHEEL-MOD', box: { x: 927, y: 123, w: 729, h: 215 } },
  { id: 'polyMod', title: 'POLY-MOD', box: { x: 1715, y: 123, w: 732, h: 215 } },
  { id: 'oscA', title: 'OSCILLATOR A', box: { x: 124, y: 362, w: 778, h: 215 } },
  { id: 'mixer', title: 'MIXER', box: { x: 962, y: 361, w: 592, h: 215 } },
  { id: 'filter', title: 'FILTER', box: { x: 1613, y: 361, w: 838, h: 452 } },
  { id: 'oscB', title: 'OSCILLATOR B', box: { x: 125, y: 601, w: 1194, h: 216 } },
  { id: 'amplifier', title: 'AMPLIFIER', box: { x: 2509, y: 596, w: 773, h: 216 } },
  { id: 'programmer', title: 'PROGRAMMER', box: { x: 545, y: 837, w: 1908, h: 218 } },
]

export const DESKTOP_KNOBS: KnobLayout[] = [
  { param: 'lfoInitialAmount', x: 212, y: 222, label: 'INITIAL AMOUNT' },
  { param: 'lfoFreq', x: 408, y: 218, label: 'FREQUENCY' },
  {
    param: 'wheelSourceMix',
    x: 1022,
    y: 220,
    label: 'SOURCE MIX',
    scale: 'bipolar',
    endLabels: ['LFO', 'NOISE'],
  },
  { param: 'polyFiltEnvAmount', x: 1820, y: 220, label: 'FILT ENV', labelDx: 58, labelDy: 40 },
  { param: 'polyOscBAmount', x: 2016, y: 216, label: 'OSC B', labelDx: 54, labelDy: 40 },

  { param: 'oscAFreq', x: 210, y: 462, label: 'FREQUENCY' },
  { param: 'oscAPulseWidth', x: 664, y: 462, label: 'PULSE WIDTH' },
  { param: 'mixOscA', x: 1060, y: 458, label: 'OSC A' },
  { param: 'mixOscB', x: 1254, y: 462, label: 'OSC B' },
  { param: 'mixNoise', x: 1452, y: 458, label: 'NOISE' },
  { param: 'filterCutoff', x: 1842, y: 462, label: 'CUTOFF' },
  { param: 'filterResonance', x: 2034, y: 460, label: 'RESONANCE' },
  { param: 'filterEnvAmount', x: 2232, y: 460, label: 'ENVELOPE AMOUNT' },
  { param: 'ui:masterTune', x: 2622, y: 456, label: 'MASTER TUNE', scale: 'bipolar', chrome: true },

  { param: 'oscBFreq', x: 214, y: 706, label: 'FREQUENCY' },
  { param: 'oscBFine', x: 412, y: 704, label: 'FINE' },
  { param: 'oscBPulseWidth', x: 974, y: 704, label: 'PULSE WIDTH' },
  {
    param: 'vintage',
    x: 1464,
    y: 700,
    label: 'VINTAGE',
    ticks: ['4', '', '3', '', '', '', '', '', '2', '', '1'],
  },
  { param: 'filterAttack', x: 1744, y: 700, label: 'ATTACK' },
  { param: 'filterDecay', x: 1942, y: 700, label: 'DECAY' },
  { param: 'filterSustain', x: 2138, y: 700, label: 'SUSTAIN' },
  { param: 'filterRelease', x: 2328, y: 698, label: 'RELEASE' },
  { param: 'ampAttack', x: 2620, y: 698, label: 'ATTACK' },
  { param: 'ampDecay', x: 2812, y: 698, label: 'DECAY' },
  { param: 'ampSustain', x: 3008, y: 696, label: 'SUSTAIN' },
  { param: 'ampRelease', x: 3200, y: 696, label: 'RELEASE' },

  { param: 'glideRate', x: 214, y: 948, label: 'GLIDE RATE' },
  { param: 'ui:volume', x: 2910, y: 936, label: 'VOLUME', chrome: true },
]

/** Program-select buttons are evenly spaced; measured first and last agree with this pitch. */
const PROGRAM_X0 = 1482
const PROGRAM_PITCH = 106

export const DESKTOP_SWITCHES: SwitchLayout[] = [
  { param: 'lfoSaw', x: 593, y: 228, icon: 'saw' },
  { param: 'lfoTri', x: 701, y: 228, icon: 'triangle' },
  { param: 'lfoSquare', x: 809, y: 228, icon: 'pulse' },

  { param: 'wheelFreqA', x: 1170, y: 228, label: 'FREQ A', labelAbove: true },
  { param: 'wheelFreqB', x: 1276, y: 228, label: 'FREQ B', labelAbove: true },
  { param: 'wheelPwA', x: 1382, y: 228, label: 'PW A', labelAbove: true },
  { param: 'wheelPwB', x: 1489, y: 228, label: 'PW B', labelAbove: true },
  { param: 'wheelFilter', x: 1597, y: 228, label: 'FILTER', labelAbove: true },

  { param: 'polyFreqA', x: 2165, y: 228, label: 'FREQ A', labelAbove: true },
  { param: 'polyPwA', x: 2276, y: 228, label: 'PW A', labelAbove: true },
  { param: 'polyFilter', x: 2384, y: 228, label: 'FILTER', labelAbove: true },

  { param: 'oscASaw', x: 399, y: 466, icon: 'saw' },
  { param: 'oscAPulse', x: 509, y: 466, icon: 'pulse' },
  { param: 'oscSync', x: 844, y: 466, label: 'SYNC' },

  {
    param: 'filterRev',
    x: 1671,
    y: 462,
    label: 'REV',
    leds: 2,
    ledLabels: ['1/2', '3'],
    ledMode: 'exclusive',
  },
  {
    param: 'filterKeyboardTrack',
    x: 2388,
    y: 461,
    label: 'KEYBOARD',
    leds: 2,
    ledLabels: ['HALF', 'FULL'],
    ledMode: 'select',
  },

  { param: 'ui:a440', x: 2796, y: 463, label: 'A440' },
  {
    param: 'ui:velocity',
    bits: ['velocityFilter', 'velocityAmp'],
    x: 2989,
    y: 460,
    label: 'VELOCITY',
    leds: 2,
    ledLabels: ['FILT', 'AMP'],
    ledMode: 'bitmask',
  },
  {
    param: 'ui:aftertouch',
    bits: ['aftertouchFilter', 'aftertouchLfo'],
    x: 3179,
    y: 460,
    label: 'AFTERTOUCH',
    leds: 2,
    ledLabels: ['FILT', 'LFO'],
    ledMode: 'bitmask',
  },

  { param: 'oscBSaw', x: 594, y: 705, icon: 'saw' },
  { param: 'oscBTri', x: 706, y: 705, icon: 'triangle' },
  { param: 'oscBPulse', x: 817, y: 705, icon: 'pulse' },
  { param: 'oscBLoFreq', x: 1150, y: 705, label: 'LO FREQ' },
  { param: 'oscBKeyboard', x: 1260, y: 705, label: 'KEYBOARD' },

  { param: 'unison', x: 417, y: 941, label: 'UNISON' },
  { param: 'ui:preset', x: 606, y: 941, label: 'PRESET' },
  { param: 'ui:record', x: 769, y: 941, label: 'RECORD', momentary: true, action: 'record' },
  { param: 'ui:factory', x: 939, y: 941, label: 'FACTORY', action: 'factory' },
  {
    param: 'ui:groupSelect',
    x: 1042,
    y: 941,
    label: 'GROUP\nSELECT',
    momentary: true,
    action: 'groupSelect',
  },
  {
    param: 'ui:bankSelect',
    x: 1147,
    y: 941,
    label: 'BANK\nSELECT',
    momentary: true,
    action: 'bankSelect',
  },
  ...Array.from({ length: 8 }, (_, i): SwitchLayout => ({
    param: `ui:program${i + 1}`,
    x: PROGRAM_X0 + i * PROGRAM_PITCH,
    y: 940,
    label: String(i + 1),
    momentary: true,
    action: `program${i + 1}` as PanelAction,
  })),
  { param: 'ui:globals', x: 2388, y: 939, label: 'GLOBALS', leds: 2 },
  { param: 'releaseSwitch', x: 2608, y: 936, label: 'RELEASE' },
  { param: 'ui:tune', x: 3182, y: 933, label: 'TUNE', momentary: true },
]

export const DESKTOP_BRACKETS: BracketLayout[] = [
  { x1: 556, x2: 848, y: 292, text: 'SHAPE' },
  { x1: 1136, x2: 1634, y: 292, text: 'DESTINATION' },
  { x1: 1742, x2: 2112, y: 292, text: 'SOURCE AMOUNT' },
  { x1: 366, x2: 544, y: 531, text: 'SHAPE' },
  { x1: 556, x2: 856, y: 771, text: 'SHAPE' },
  { x1: 1448, x2: 2258, y: 1009, text: 'PROGRAM SELECT' },
]

export const DESKTOP_DISPLAY: Box = { x: 1237, y: 905, w: 165, h: 72 }

/** Two rows of shifted globals legends, centred over the program-select buttons. */
export const DESKTOP_SHIFT_LABEL_Y = { top: 866, bottom: 901 }

export const DESKTOP_SHIFT_LABELS: { x: number; top: string; bottom: string }[] = [
  { x: PROGRAM_X0 + 0 * PROGRAM_PITCH, top: 'Transpose', bottom: 'Pot Mode' },
  { x: PROGRAM_X0 + 1 * PROGRAM_PITCH, top: 'MIDI Chnl', bottom: 'Rel Sust' },
  { x: PROGRAM_X0 + 2 * PROGRAM_PITCH, top: 'Param Xmit', bottom: 'Pedal Mode' },
  { x: PROGRAM_X0 + 3 * PROGRAM_PITCH, top: 'Param Rcv', bottom: 'Alt Tuning' },
  { x: PROGRAM_X0 + 4 * PROGRAM_PITCH, top: 'MIDI Control', bottom: '' },
  { x: PROGRAM_X0 + 5 * PROGRAM_PITCH, top: 'MIDI SysEx', bottom: '' },
  { x: PROGRAM_X0 + 6 * PROGRAM_PITCH, top: 'MIDI Out', bottom: 'Pgm Dump' },
  { x: PROGRAM_X0 + 7 * PROGRAM_PITCH, top: 'Local Ctrl', bottom: '' },
]

/** The pair of indicator lamps to the left of the shifted legends. */
export const DESKTOP_SHIFT_LAMPS = { x: 1422, top: 862, bottom: 897 }
