/**
 * Panel geometry, in the coordinate space of the reference patch sheet (2653 x 1137).
 *
 * These are not eyeballed. Knob centres came from Hough circle detection over
 * reference/panel.jpg (28 circles found, which is exactly the number of knobs on the
 * instrument), switch and section boxes from contour detection. Keeping the reference's own
 * coordinate space means the layout can always be re-derived from, and diffed against, the sheet.
 */

import { BY_ID } from '../domain/parameters'
import type { PanelAction } from '../state/actions'

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

/**
 * Box -> <rect> attributes. Spreading a Box straight onto a rect passes `w`/`h`, which SVG ignores
 * silently: the element renders at zero size and simply is not there. Always go through this.
 */
export const rectProps = (b: Box) => ({ x: b.x, y: b.y, width: b.w, height: b.h })

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
  /**
   * Override the printed scale. Empty strings leave a tick unlabelled, as on VINTAGE, which has
   * eleven ticks but only four numbered reference points.
   */
  ticks?: string[]
  /** Snap to integer detents. */
  detents?: number
  /** Fully chromed top with a black marker, as on MASTER TUNE and VOLUME. */
  chrome?: boolean
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
  /** Momentary buttons that act rather than hold a value dispatch this named action. */
  action?: PanelAction
  /** Cap finish. Most caps are black; the patch buttons are grey and RECORD is red. */
  cap?: 'grey' | 'red'
}

export interface BracketLayout {
  x1: number
  x2: number
  y: number
  text: string
}

/**
 * Extra breathing room inside every section frame, beyond the outline measured off the patch
 * sheet. Horizontal only: the rows sit ~8 units apart vertically, so growing the frames downward
 * would collide with the row beneath before it bought any padding.
 */
const SECTION_PAD_X = 10


/** Clear space between neighbouring section frames, in both directions. */
const GROUP_GAP = 22
/**
 * Frame height, and how far its top sits above the row's control centres. The rise carries more
 * clearance than the sheet's outline: the topmost scale number sits a full knob radius above the
 * control centre, so a tighter frame crowds it against the rule.
 */
const BOX_H = 137
const BOX_RISE = 67

/**
 * Control rows. The patch sheet packs the rows only ~8 units apart, but on the instrument the gap
 * between stacked sections matches the gap between sections across, so the rows are derived from
 * GROUP_GAP and the whole block is centred on the faceplate rather than taken from the sheet.
 */
const ROW1 = 156
const ROW2 = ROW1 + BOX_H + GROUP_GAP
const ROW3 = ROW2 + BOX_H + GROUP_GAP

const rowBox = (row: number, x: number, w: number): Box => ({ x, y: row - BOX_RISE, w, h: BOX_H })

const MEASURED_SECTIONS: SectionLayout[] = [
  { id: 'polyMod', title: 'POLY-MOD', box: rowBox(ROW1, 82, 461) },
  { id: 'oscA', title: 'OSCILLATOR A', box: rowBox(ROW1, 586, 478) },
  { id: 'mixer', title: 'MIXER', box: rowBox(ROW1, 1106, 366) },
  // The filter frame is the one that spans two rows.
  {
    id: 'filter',
    title: 'FILTER',
    box: { x: 1514, y: ROW1 - BOX_RISE, w: 522, h: ROW2 - ROW1 + BOX_H },
  },
  { id: 'lfo', title: 'LFO', box: rowBox(ROW2, 82, 461) },
  { id: 'oscB', title: 'OSCILLATOR B', box: rowBox(ROW2, 586, 738) },
  { id: 'amplifier', title: 'AMPLIFIER', box: rowBox(ROW2, 2079, 487) },
  { id: 'wheelMod', title: 'WHEEL-MOD', box: rowBox(ROW3, 82, 461) },
  { id: 'programmer', title: 'PROGRAMMER', box: rowBox(ROW3, 846, 1190) },
]

export const SECTIONS: SectionLayout[] = MEASURED_SECTIONS.map((section) => ({
  ...section,
  box: {
    ...section.box,
    x: section.box.x - SECTION_PAD_X,
    w: section.box.w + SECTION_PAD_X * 2,
  },
}))

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
  { param: 'ui:masterTune', x: 2140, y: ROW1, label: 'MASTER TUNE', scale: 'bipolar', chrome: true },
    {
    param: 'vintage',
    x: 1418,
    y: ROW2,
    label: 'VINTAGE',
    // Continuous, but printed with four reference points running 4-3-2-1 clockwise.
    ticks: ['4', '', '3', '', '', '', '', '', '2', '', '1'],
  },
  { param: 'glideRate', x: 646, y: ROW3, label: 'GLIDE RATE' },
  { param: 'ui:volume', x: 2322, y: ROW3, label: 'VOLUME', chrome: true },
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
  { param: 'ui:tune', x: 2505, y: ROW3, label: 'TUNE', momentary: true, cap: 'grey' },

  // Programmer
  { param: 'ui:preset', x: 879, y: ROW3, label: 'PRESET' },
  { param: 'ui:record', x: 983, y: ROW3, label: 'RECORD', momentary: true, action: 'record', cap: 'red' },
  { param: 'ui:factory', x: 1088, y: ROW3, label: 'FACTORY', cap: 'grey', action: 'factory' },
  {
    param: 'ui:groupSelect',
    x: 1154,
    y: ROW3,
    label: 'GROUP\nSELECT',
    momentary: true,
    action: 'groupSelect',
    cap: 'grey',
  },
  {
    param: 'ui:bankSelect',
    x: 1220,
    y: ROW3,
    label: 'BANK\nSELECT',
    momentary: true,
    action: 'bankSelect',
    cap: 'grey',
  },
  ...Array.from({ length: 8 }, (_, i): SwitchLayout => ({
    param: `ui:program${i + 1}`,
    x: 1428 + i * 67,
    y: ROW3,
    label: String(i + 1),
    momentary: true,
    action: `program${i + 1}` as PanelAction,
    cap: 'grey',
  })),
  { param: 'ui:globals', x: 2001, y: ROW3, label: 'GLOBALS', leds: 2 },
]

/**
 * Human-readable name for any control id, used by the bindings list. Built from the panel legends
 * so it reads the way the faceplate does, qualified by section for the reused ones.
 */
const CONTROL_LABELS = new Map<string, string>()
for (const knob of KNOBS) CONTROL_LABELS.set(knob.param, knob.label)
for (const sw of SWITCHES) {
  if (sw.label) CONTROL_LABELS.set(sw.param, sw.label.replace('\n', ' '))
}

export function controlDisplayName(id: string): string {
  const fromLayout = CONTROL_LABELS.get(id)
  const domain = BY_ID.get(id)
  if (domain) return accessibleName(domain.section, fromLayout ?? domain.name)
  return fromLayout ?? id.replace(/^ui:/, '')
}

/** The bracketed group legends printed under runs of controls. */
const BRACKET_DROP = BOX_H - BOX_RISE - 9

export const BRACKETS: BracketLayout[] = [
  { x1: 88, x2: 320, y: ROW1 + BRACKET_DROP, text: 'SOURCE AMOUNT' },
  { x1: 336, x2: 540, y: ROW2 + BRACKET_DROP, text: 'SHAPE' },
  { x1: 208, x2: 540, y: ROW3 + BRACKET_DROP, text: 'DESTINATION' },
  { x1: 718, x2: 852, y: ROW1 + BRACKET_DROP, text: 'SHAPE' },
  { x1: 840, x2: 1044, y: ROW2 + BRACKET_DROP, text: 'SHAPE' },
  { x1: 1400, x2: 1930, y: ROW3 + BRACKET_DROP, text: 'PROGRAM SELECT' },
]

/** The three-digit LED readout in the programmer section. */
export const DISPLAY: Box = { x: 1269, y: ROW3 - 27, w: 114, h: 54 }

/** Baselines for the two rows of shifted legends printed above the program-select buttons. */
export const SHIFT_LABEL_Y = { top: ROW3 - 45, bottom: ROW3 - 27 }

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

/** The black bed the wheels are mounted on, filling the space left of the keys. */
export const WHEEL_PANEL: Box = { x: 57, y: 738, w: 201, h: 379 }

export const WHEELS = {
  pitch: { x: 114, y: 855, w: 47, h: 160, label: 'PITCH' },
  mod: { x: 197, y: 855, w: 47, h: 160, label: 'MOD' },
}
