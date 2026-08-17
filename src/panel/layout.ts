/**
 * Panel geometry, in the coordinate space of the reference patch sheet (2653 x 1137).
 *
 * These are not eyeballed. Knob centres came from Hough circle detection over
 * public/reference/panel.jpg (28 circles found, which is exactly the number of knobs on the
 * instrument), switch and section boxes from contour detection. Keeping the reference's own
 * coordinate space means the layout can always be re-derived from, and diffed against, the sheet.
 */

export const PANEL = { width: 2653, height: 1137 }
export const CHASSIS = { x: 15, y: 34, w: 2618, h: 1085 }
export const PLATE = { x: 57, y: 74, w: 2534, h: 485 }

/** Knob drawing metrics, measured off the sheet. */
export const KNOB = {
  radius: 28,
  tickInner: 32,
  tickOuter: 41,
  numberRadius: 51,
  /** Sweep runs from -135deg (minimum, lower left) to +135deg (maximum, lower right). */
  sweep: 270,
}

/** Switch bezel metrics. */
export const SWITCH = { w: 38, h: 52 }

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface SectionLayout {
  id: string
  title: string
  box: Box
}

export type KnobScale = 'unipolar' | 'bipolar'

export interface KnobLayout {
  /** Parameter id from the domain table, or a `ui:` prefixed id for non-program controls. */
  param: string
  x: number
  y: number
  label: string
  scale?: KnobScale
  /** Legends printed either side of the scale, as on WHEEL-MOD's LFO/NOISE. */
  endLabels?: [string, string]
  labelDx?: number
  labelDy?: number
  /** Snap to integer detents, as on the Vintage knob's 1-4 positions. */
  detents?: number
}

export type SwitchIcon = 'saw' | 'triangle' | 'pulse'

/**
 * How a cap's LEDs report its value:
 *   toggle    - every LED lights above the minimum (plain on/off)
 *   exclusive - LED i lights when value === min + i (always exactly one, e.g. FILTER REV)
 *   select    - LED i lights when value === min + i + 1, so the minimum lights none
 *               (e.g. FILTER KEYBOARD: off / HALF / FULL)
 *   bitmask   - LED i lights when bit i is set (e.g. VELOCITY -> FILT and/or AMP)
 */
export type LedMode = 'toggle' | 'exclusive' | 'select' | 'bitmask'

export interface SwitchLayout {
  param: string
  /** Centre of the bezel. */
  x: number
  y: number
  label?: string
  labelAbove?: boolean
  icon?: SwitchIcon
  /** Number of LEDs in the cap. */
  leds?: number
  ledLabels?: [string, string]
  ledMode?: LedMode
  /**
   * A single cap that drives one program parameter per LED. The panel's VELOCITY and AFTERTOUCH
   * buttons look like one control but are two independent routing switches underneath.
   */
  bits?: string[]
  momentary?: boolean
}

export interface BracketLayout {
  x1: number
  x2: number
  y: number
  text: string
}

export const SECTIONS: SectionLayout[] = [
  { id: 'polyMod', title: 'POLY-MOD', box: { x: 82, y: 116, w: 461, h: 131 } },
  { id: 'oscA', title: 'OSCILLATOR A', box: { x: 586, y: 116, w: 478, h: 131 } },
  { id: 'mixer', title: 'MIXER', box: { x: 1106, y: 116, w: 366, h: 131 } },
  { id: 'filter', title: 'FILTER', box: { x: 1514, y: 116, w: 522, h: 270 } },
  { id: 'lfo', title: 'LFO', box: { x: 82, y: 255, w: 461, h: 131 } },
  { id: 'oscB', title: 'OSCILLATOR B', box: { x: 586, y: 255, w: 738, h: 131 } },
  { id: 'amplifier', title: 'AMPLIFIER', box: { x: 2079, y: 255, w: 487, h: 131 } },
  { id: 'wheelMod', title: 'WHEEL-MOD', box: { x: 82, y: 394, w: 461, h: 131 } },
  { id: 'programmer', title: 'PROGRAMMER', box: { x: 846, y: 394, w: 1190, h: 131 } },
]

const SECTION_TITLES = new Map(SECTIONS.map((s) => [s.id, s.title]))

/**
 * Accessible name for a control. The faceplate reuses short legends — three knobs are printed
 * "FREQUENCY" and two "ATTACK" — so the section has to qualify them or they are indistinguishable
 * to anyone not looking at the panel.
 */
export function accessibleName(section: string | undefined, label: string): string {
  const title = section ? SECTION_TITLES.get(section) : undefined
  return title ? `${title} ${label}` : label
}

const ROW1 = 177
const ROW2 = 316
const ROW3 = 455

export const KNOBS: KnobLayout[] = [
  // Poly-Mod — labels sit to the lower right of each knob on the real panel.
  { param: 'polyFiltEnvAmount', x: 142, y: ROW1, label: 'FILT ENV', labelDx: 52, labelDy: 34 },
  { param: 'polyOscBAmount', x: 266, y: ROW1, label: 'OSC B', labelDx: 48, labelDy: 34 },

  // LFO
  { param: 'lfoInitialAmount', x: 142, y: ROW2, label: 'INITIAL AMOUNT' },
  { param: 'lfoFreq', x: 264, y: ROW2, label: 'FREQUENCY' },

  // Wheel-Mod
  {
    param: 'wheelSourceMix',
    x: 142,
    y: ROW3,
    label: 'SOURCE MIX',
    scale: 'bipolar',
    endLabels: ['LFO', 'NOISE'],
  },

  // Oscillator A
  { param: 'oscAFreq', x: 646, y: ROW1, label: 'FREQUENCY' },
  { param: 'oscAPulseWidth', x: 924, y: ROW1, label: 'PULSE WIDTH' },

  // Oscillator B
  { param: 'oscBFreq', x: 646, y: ROW2, label: 'FREQUENCY' },
  { param: 'oscBFine', x: 768, y: ROW2, label: 'FINE' },
  { param: 'oscBPulseWidth', x: 1116, y: ROW2, label: 'PULSE WIDTH' },

  // Mixer
  { param: 'mixOscA', x: 1166, y: ROW1, label: 'OSC A' },
  { param: 'mixOscB', x: 1288, y: ROW1, label: 'OSC B' },
  { param: 'mixNoise', x: 1410, y: ROW1, label: 'NOISE' },

  // Filter
  { param: 'filterCutoff', x: 1654, y: ROW1, label: 'CUTOFF' },
  { param: 'filterResonance', x: 1774, y: ROW1, label: 'RESONANCE' },
  { param: 'filterEnvAmount', x: 1896, y: ROW1, label: 'ENVELOPE AMOUNT' },
  { param: 'filterAttack', x: 1592, y: ROW2, label: 'ATTACK' },
  { param: 'filterDecay', x: 1714, y: ROW2, label: 'DECAY' },
  { param: 'filterSustain', x: 1836, y: ROW2, label: 'SUSTAIN' },
  { param: 'filterRelease', x: 1956, y: ROW2, label: 'RELEASE' },

  // Amplifier
  { param: 'ampAttack', x: 2140, y: ROW2, label: 'ATTACK' },
  { param: 'ampDecay', x: 2262, y: ROW2, label: 'DECAY' },
  { param: 'ampSustain', x: 2382, y: ROW2, label: 'SUSTAIN' },
  { param: 'ampRelease', x: 2504, y: ROW2, label: 'RELEASE' },

  // Free-standing controls
  { param: 'ui:masterTune', x: 2140, y: ROW1, label: 'MASTER TUNE', scale: 'bipolar' },
  { param: 'vintage', x: 1418, y: ROW2, label: 'VINTAGE', scale: 'bipolar', detents: 4 },
  { param: 'glideRate', x: 646, y: ROW3, label: 'GLIDE RATE' },
  { param: 'ui:volume', x: 2322, y: ROW3, label: 'VOLUME' },
]

export const SWITCHES: SwitchLayout[] = [
  // Poly-Mod destinations
  { param: 'polyFreqA', x: 369, y: ROW1, label: 'FREQ A', labelAbove: true },
  { param: 'polyPwA', x: 438, y: ROW1, label: 'PW A', labelAbove: true },
  { param: 'polyFilter', x: 508, y: ROW1, label: 'FILTER', labelAbove: true },

  // LFO shape
  { param: 'lfoSaw', x: 369, y: ROW2, icon: 'saw' },
  { param: 'lfoTri', x: 438, y: ROW2, icon: 'triangle' },
  { param: 'lfoSquare', x: 508, y: ROW2, icon: 'pulse' },

  // Wheel-Mod destinations
  { param: 'wheelFreqA', x: 230, y: ROW3, label: 'FREQ A', labelAbove: true },
  { param: 'wheelFreqB', x: 299, y: ROW3, label: 'FREQ B', labelAbove: true },
  { param: 'wheelPwA', x: 369, y: ROW3, label: 'PW A', labelAbove: true },
  { param: 'wheelPwB', x: 438, y: ROW3, label: 'PW B', labelAbove: true },
  { param: 'wheelFilter', x: 508, y: ROW3, label: 'FILTER', labelAbove: true },

  // Oscillator A
  { param: 'oscASaw', x: 751, y: ROW1, icon: 'saw' },
  { param: 'oscAPulse', x: 820, y: ROW1, icon: 'pulse' },
  { param: 'oscSync', x: 1028, y: ROW1, label: 'SYNC' },

  // Oscillator B
  { param: 'oscBSaw', x: 872, y: ROW2, icon: 'saw' },
  { param: 'oscBTri', x: 942, y: ROW2, icon: 'triangle' },
  { param: 'oscBPulse', x: 1011, y: ROW2, icon: 'pulse' },
  { param: 'oscBLoFreq', x: 1220, y: ROW2, label: 'LO FREQ' },
  { param: 'oscBKeyboard', x: 1289, y: ROW2, label: 'KEYBOARD' },

  // Filter
  {
    param: 'filterRev',
    x: 1549,
    y: ROW1,
    label: 'REV',
    leds: 2,
    ledLabels: ['1/2', '3'],
    ledMode: 'exclusive',
  },
  {
    param: 'filterKeyboardTrack',
    x: 2001,
    y: ROW1,
    label: 'KEYBOARD',
    leds: 2,
    ledLabels: ['HALF', 'FULL'],
    ledMode: 'select',
  },

  // Master / performance
  { param: 'ui:a440', x: 2261, y: ROW1, label: 'A440' },
  {
    param: 'ui:velocity',
    bits: ['velocityFilter', 'velocityAmp'],
    x: 2383,
    y: ROW1,
    label: 'VELOCITY',
    leds: 2,
    ledLabels: ['FILT', 'AMP'],
    ledMode: 'bitmask',
  },
  {
    param: 'ui:aftertouch',
    bits: ['aftertouchFilter', 'aftertouchLfo'],
    x: 2505,
    y: ROW1,
    label: 'AFTERTOUCH',
    leds: 2,
    ledLabels: ['FILT', 'LFO'],
    ledMode: 'bitmask',
  },

  // Voice
  { param: 'unison', x: 761, y: ROW3, label: 'UNISON' },
  { param: 'releaseSwitch', x: 2140, y: ROW3, label: 'RELEASE' },
  { param: 'ui:tune', x: 2505, y: ROW3, label: 'TUNE', momentary: true },

  // Programmer
  { param: 'ui:preset', x: 879, y: ROW3, label: 'PRESET' },
  { param: 'ui:record', x: 983, y: ROW3, label: 'RECORD', momentary: true },
  { param: 'ui:factory', x: 1088, y: ROW3, label: 'FACTORY' },
  { param: 'ui:groupSelect', x: 1154, y: ROW3, label: 'GROUP\nSELECT', momentary: true },
  { param: 'ui:bankSelect', x: 1220, y: ROW3, label: 'BANK\nSELECT', momentary: true },
  ...Array.from({ length: 8 }, (_, i): SwitchLayout => ({
    param: `ui:program${i + 1}`,
    x: 1428 + i * 67,
    y: ROW3,
    label: String(i + 1),
    momentary: true,
  })),
  { param: 'ui:globals', x: 2001, y: ROW3, label: 'GLOBALS', leds: 2 },
]

/** The bracketed group legends printed under runs of controls. */
export const BRACKETS: BracketLayout[] = [
  { x1: 88, x2: 320, y: 238, text: 'SOURCE AMOUNT' },
  { x1: 336, x2: 540, y: 376, text: 'SHAPE' },
  { x1: 208, x2: 540, y: 515, text: 'DESTINATION' },
  { x1: 718, x2: 852, y: 238, text: 'SHAPE' },
  { x1: 840, x2: 1044, y: 376, text: 'SHAPE' },
  { x1: 1400, x2: 1930, y: 515, text: 'PROGRAM SELECT' },
]

/** The three-digit LED readout in the programmer section. */
export const DISPLAY: Box = { x: 1269, y: 428, w: 114, h: 54 }

/** Shifted (globals) legends printed above the eight program-select buttons. */
export const SHIFT_LABELS: { x: number; top: string; bottom: string }[] = [
  { x: 1428, top: 'Transpose', bottom: 'Pot Mode' },
  { x: 1495, top: 'MIDI Channel', bottom: 'Release Sus' },
  { x: 1562, top: 'Param Xmit', bottom: 'Pedal Mode' },
  { x: 1629, top: 'Param Rcv', bottom: 'Alt Tuning' },
  { x: 1696, top: 'MIDI Control', bottom: 'Vel Response' },
  { x: 1763, top: 'MIDI SysEx', bottom: 'AT Response' },
  { x: 1830, top: 'MIDI Out', bottom: 'Pgm Dump' },
  { x: 1897, top: 'Local Ctrl', bottom: '' },
]

/** The nameplate at the lower right of the chassis. */
export const LOGO_PLATE: Box = { x: 2160, y: 606, w: 326, h: 87 }

/** Keyboard: 61 keys spanning five octaves from C2, so 36 white keys. */
export const KEYBOARD = {
  x: 268,
  y: 738,
  h: 379,
  whiteKeys: 36,
  whiteWidth: 64.57,
  blackWidth: 38,
  blackHeight: 240,
  firstMidiNote: 36,
}

export const WHEELS = {
  pitch: { x: 114, y: 855, w: 47, h: 160, label: 'PITCH' },
  mod: { x: 197, y: 855, w: 47, h: 160, label: 'MOD' },
}
