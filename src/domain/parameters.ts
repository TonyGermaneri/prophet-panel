/**
 * The Prophet-5/10 Rev4 parameter table.
 *
 * This is the single source of truth for the whole app. The MIDI implementation doc claims:
 *
 *   "The 128 'packed' parameter bytes in the program dump follow the order of the NRPN list,
 *    one byte per parameter, and padded with zeros from the final parameter to the 128th byte."
 *
 * Decoding the 120 factory files shows that holds for NRPN 0-54 but breaks down after: bytes
 * 55-64 are the unison note assignments, and 65-84 are the program name, which the doc lists as
 * "RESERVED". So a parameter has two distinct numbers, and conflating them is a real bug — NRPN 80
 * (layer select) would otherwise write into the middle of the name.
 *
 *   `nrpn`   - the live control number, for the NRPN message stream.
 *   `offset` - the byte position within the program, present only where the corpus confirms it.
 *
 * Bytes 85-96 hold identical values in all 120 factory patches, so that region carries no evidence
 * about which byte is which parameter. Those parameters are therefore control-only: drivable live,
 * but never written into a program until confirmed on hardware. The bytes survive edits untouched.
 *
 * Source: Prophet-5 MIDI Implementation 1.4 (Sequential), cross-checked against patches/factory/.
 */

export type Section =
  | 'polyMod'
  | 'lfo'
  | 'wheelMod'
  | 'oscA'
  | 'oscB'
  | 'mixer'
  | 'filter'
  | 'amplifier'
  | 'voice'
  | 'performance'
  | 'layer'

export type ParamType = 'continuous' | 'switch' | 'enum'

export interface Parameter {
  /** NRPN number, used for live parameter control over MIDI. */
  nrpn: number
  /**
   * Byte position within the program payload. Undefined means the byte position is unconfirmed,
   * so the parameter can be driven live but is never stored into a patch.
   */
  offset?: number
  /** Stable identifier used by the UI and layout table. */
  id: string
  /** Panel legend. */
  name: string
  section: Section
  type: ParamType
  min: number
  max: number
  /** MIDI CC number, where one exists. NRPN is preferred; CC is the fallback path. */
  cc?: number
  /** Display labels for enum parameters, indexed from `min`. */
  labels?: string[]
  /** False for parameters sourced from forum/support posts rather than the official spec. */
  verified: boolean
}

/** Below this, NRPN number and byte offset coincide; above it they do not. */
const OFFSET_EQUALS_NRPN_BELOW = 55

const p = (
  nrpn: number,
  id: string,
  name: string,
  section: Section,
  type: ParamType,
  min: number,
  max: number,
  extra: Partial<Parameter> = {},
): Parameter => ({
  nrpn,
  offset: nrpn < OFFSET_EQUALS_NRPN_BELOW ? nrpn : undefined,
  id,
  name,
  section,
  type,
  min,
  max,
  verified: true,
  ...extra,
})

/** Knobs on this synth are almost all 0-120, not 0-127. Getting this wrong misreads every value. */
const POT = 120

export const PARAMETERS: Parameter[] = [
  // ---- Oscillator A ----
  p(0, 'oscAFreq', 'Frequency', 'oscA', 'continuous', 0, POT, { cc: 3 }),
  p(3, 'oscASaw', 'Saw', 'oscA', 'switch', 0, 1, { cc: 15 }),
  p(4, 'oscAPulse', 'Pulse', 'oscA', 'switch', 0, 1, { cc: 20 }),
  p(8, 'oscAPulseWidth', 'Pulse Width', 'oscA', 'continuous', 0, POT, { cc: 21 }),
  p(10, 'oscSync', 'Sync', 'oscA', 'switch', 0, 1, { cc: 23 }),

  // ---- Oscillator B ----
  p(1, 'oscBFreq', 'Frequency', 'oscB', 'continuous', 0, POT, { cc: 9 }),
  p(2, 'oscBFine', 'Fine', 'oscB', 'continuous', 0, 127, { cc: 14 }),
  p(5, 'oscBSaw', 'Saw', 'oscB', 'switch', 0, 1, { cc: 30 }),
  p(6, 'oscBTri', 'Triangle', 'oscB', 'switch', 0, 1, { cc: 52 }),
  p(7, 'oscBPulse', 'Pulse', 'oscB', 'switch', 0, 1, { cc: 116 }),
  p(9, 'oscBPulseWidth', 'Pulse Width', 'oscB', 'continuous', 0, POT, { cc: 22 }),
  p(11, 'oscBLoFreq', 'Lo Freq', 'oscB', 'switch', 0, 1, { cc: 24 }),
  p(12, 'oscBKeyboard', 'Keyboard', 'oscB', 'switch', 0, 1, { cc: 25 }),

  // ---- Mixer ----
  p(14, 'mixOscA', 'Osc A', 'mixer', 'continuous', 0, POT, { cc: 27 }),
  p(15, 'mixOscB', 'Osc B', 'mixer', 'continuous', 0, POT, { cc: 28 }),
  p(16, 'mixNoise', 'Noise', 'mixer', 'continuous', 0, POT, { cc: 29 }),

  // ---- Filter ----
  p(17, 'filterCutoff', 'Cutoff', 'filter', 'continuous', 0, POT, { cc: 73 }),
  p(18, 'filterResonance', 'Resonance', 'filter', 'continuous', 0, POT, { cc: 31 }),
  p(40, 'filterEnvAmount', 'Envelope Amount', 'filter', 'continuous', 0, POT, { cc: 89 }),
  p(19, 'filterKeyboardTrack', 'Keyboard', 'filter', 'enum', 0, 2, {
    cc: 35,
    labels: ['Off', 'Half', 'Full'],
  }),
  p(20, 'filterRev', 'Rev', 'filter', 'enum', 0, 1, { cc: 41, labels: ['1/2', '3'] }),
  p(43, 'filterAttack', 'Attack', 'filter', 'continuous', 0, POT, { cc: 103 }),
  p(45, 'filterDecay', 'Decay', 'filter', 'continuous', 0, POT, { cc: 105 }),
  p(47, 'filterSustain', 'Sustain', 'filter', 'continuous', 0, POT, { cc: 107 }),
  p(49, 'filterRelease', 'Release', 'filter', 'continuous', 0, POT, { cc: 109 }),

  // ---- Amplifier ----
  p(44, 'ampAttack', 'Attack', 'amplifier', 'continuous', 0, POT, { cc: 104 }),
  p(46, 'ampDecay', 'Decay', 'amplifier', 'continuous', 0, POT, { cc: 106 }),
  p(48, 'ampSustain', 'Sustain', 'amplifier', 'continuous', 0, POT, { cc: 108 }),
  p(50, 'ampRelease', 'Release', 'amplifier', 'continuous', 0, POT, { cc: 110 }),

  // ---- LFO ----
  p(22, 'lfoInitialAmount', 'Initial Amount', 'lfo', 'continuous', 0, POT, { cc: 47 }),
  p(21, 'lfoFreq', 'Frequency', 'lfo', 'continuous', 0, POT, { cc: 46 }),
  p(23, 'lfoSaw', 'Saw', 'lfo', 'switch', 0, 1, { cc: 117 }),
  p(24, 'lfoTri', 'Triangle', 'lfo', 'switch', 0, 1, { cc: 118 }),
  p(25, 'lfoSquare', 'Square', 'lfo', 'switch', 0, 1, { cc: 119 }),

  // ---- Wheel-Mod (the doc calls these "LFO ..."; the panel legend is WHEEL-MOD) ----
  p(26, 'wheelSourceMix', 'Source Mix', 'wheelMod', 'continuous', 0, POT, { cc: 53 }),
  p(27, 'wheelFreqA', 'Freq A', 'wheelMod', 'switch', 0, 1, { cc: 54 }),
  p(28, 'wheelFreqB', 'Freq B', 'wheelMod', 'switch', 0, 1, { cc: 55 }),
  p(29, 'wheelPwA', 'PW A', 'wheelMod', 'switch', 0, 1, { cc: 56 }),
  p(30, 'wheelPwB', 'PW B', 'wheelMod', 'switch', 0, 1, { cc: 57 }),
  p(31, 'wheelFilter', 'Filter', 'wheelMod', 'switch', 0, 1, { cc: 58 }),

  // ---- Poly-Mod ----
  p(32, 'polyFiltEnvAmount', 'Filt Env', 'polyMod', 'continuous', 0, 127, { cc: 59 }),
  p(33, 'polyOscBAmount', 'Osc B', 'polyMod', 'continuous', 0, POT, { cc: 60 }),
  p(34, 'polyFreqA', 'Freq A', 'polyMod', 'switch', 0, 1, { cc: 61 }),
  p(35, 'polyPwA', 'PW A', 'polyMod', 'switch', 0, 1, { cc: 62 }),
  p(36, 'polyFilter', 'Filter', 'polyMod', 'switch', 0, 1, { cc: 63 }),

  // ---- Voice / global-per-program ----
  p(13, 'glideRate', 'Glide Rate', 'voice', 'continuous', 0, POT, { cc: 26 }),
  p(37, 'vintage', 'Vintage', 'voice', 'continuous', 0, 127, { cc: 85 }),
  p(51, 'releaseSwitch', 'Release', 'voice', 'switch', 0, 1, { cc: 111 }),
  p(52, 'unison', 'Unison', 'voice', 'switch', 0, 1, { cc: 112 }),
  p(53, 'unisonVoiceCount', 'Unison Voices', 'voice', 'continuous', 0, 10, { cc: 113 }),
  p(54, 'unisonDetune', 'Unison Detune', 'voice', 'continuous', 0, 7, { cc: 114 }),

  // ---- Performance routing ----
  // NOTE: the panel legend reads AFTERTOUCH -> FILT / LFO, while the doc names NRPN 39
  // "AFTERTOUCH > AMP". Named after the panel; flagged in the plan to confirm on hardware.
  p(38, 'aftertouchFilter', 'Aftertouch Filter', 'performance', 'switch', 0, 1, { cc: 86 }),
  p(39, 'aftertouchLfo', 'Aftertouch LFO', 'performance', 'switch', 0, 1, { cc: 87 }),
  p(41, 'velocityFilter', 'Velocity Filter', 'performance', 'switch', 0, 1, { cc: 90 }),
  p(42, 'velocityAmp', 'Velocity Amp', 'performance', 'switch', 0, 1, { cc: 102 }),
  // Control-only: bytes 86/87 hold 6 and 0 in all 120 factory patches, which is consistent with
  // these parameters but proves nothing, so they are not written into programs.
  p(86, 'pitchWheelRange', 'Pitch Wheel Range', 'performance', 'continuous', 0, 11, { cc: 70 }),
  p(87, 'retriggerUnison', 'Retrigger / Unison', 'performance', 'enum', 0, 3, {
    cc: 71,
    labels: ['Low Note', 'Low Retrigger', 'Last Note', 'Last Retrigger'],
  }),

  // ---- Prophet-10 bi-timbral (added after MIDI doc 1.4; numbers from Sequential support posts).
  // Control-only for the same reason, and NRPN 80 would land inside the name field.
  p(80, 'layerSelect', 'Layer Select', 'layer', 'enum', 0, 1, {
    labels: ['Layer A', 'Layer B'],
    verified: false,
  }),
  p(88, 'layerAVolume', 'Layer A Volume', 'layer', 'continuous', 0, 127, { verified: false }),
  p(89, 'biTimbralMode', 'Bi-Timbral Mode', 'layer', 'enum', 1, 3, {
    labels: ['Normal', 'Stack', 'Split'],
    verified: false,
  }),
  p(91, 'layerBProgram', 'Layer B Program', 'layer', 'continuous', 0, 39, { verified: false }),
  p(95, 'splitPoint', 'Split Point', 'layer', 'continuous', 36, 96, { verified: false }),
  p(96, 'layerBVolume', 'Layer B Volume', 'layer', 'continuous', 0, 127, { verified: false }),
]

/** Unison note assignments occupy bytes 55-64; not surfaced as panel controls. */
export const UNISON_NOTE_RANGE = { start: 55, end: 64 } as const

/** The 20-character program name lives at bytes 65-84 (verified across all 120 factory files). */
export const NAME_OFFSET = 65
export const NAME_LENGTH = 20

export const PROGRAM_SIZE = 128

/** Parameters with a confirmed byte position — these are what a patch actually stores. */
export const STORED_PARAMETERS: Parameter[] = PARAMETERS.filter((x) => x.offset !== undefined)

/** Sections that appear on the physical front panel, in left-to-right panel order. */
export const PANEL_SECTIONS: Section[] = [
  'polyMod',
  'lfo',
  'wheelMod',
  'oscA',
  'oscB',
  'mixer',
  'filter',
  'amplifier',
  'voice',
]

export const BY_ID: ReadonlyMap<string, Parameter> = new Map(PARAMETERS.map((x) => [x.id, x]))
export const BY_NRPN: ReadonlyMap<number, Parameter> = new Map(PARAMETERS.map((x) => [x.nrpn, x]))
export const BY_CC: ReadonlyMap<number, Parameter> = new Map(
  PARAMETERS.filter((x) => x.cc !== undefined).map((x) => [x.cc!, x]),
)

export function param(id: string): Parameter {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown parameter id: ${id}`)
  return found
}

/** Global parameters, addressed by NRPN only (not stored in programs). */
export const GLOBAL_PARAMETERS: Parameter[] = [
  p(4096, 'transpose', 'Transpose', 'performance', 'continuous', 0, 24),
  p(4097, 'midiChannel', 'MIDI Channel', 'performance', 'continuous', 0, 16),
  p(4098, 'paramXmit', 'Param Xmit', 'performance', 'enum', 0, 2, {
    labels: ['Off', 'CC', 'NRPN'],
  }),
  p(4099, 'paramRcv', 'Param Rcv', 'performance', 'enum', 0, 2, { labels: ['Off', 'CC', 'NRPN'] }),
  p(4100, 'midiControl', 'MIDI Control', 'performance', 'enum', 0, 1, { labels: ['Off', 'On'] }),
  p(4101, 'midiSysex', 'MIDI SysEx', 'performance', 'enum', 0, 1, { labels: ['MIDI', 'USB'] }),
  p(4102, 'midiOut', 'MIDI Out', 'performance', 'enum', 0, 3, {
    labels: ['Off', 'MIDI', 'USB', 'All'],
  }),
  p(4103, 'localControl', 'Local Control', 'performance', 'enum', 0, 2, {
    labels: ['Off', 'On', 'All'],
  }),
  p(4104, 'potMode', 'Pot Mode', 'performance', 'enum', 0, 2, {
    labels: ['Relative', 'Pass Thru', 'Jump'],
  }),
  p(4105, 'sustainMode', 'Sustain Mode', 'performance', 'enum', 0, 1, {
    labels: ['Sustain', 'Sostenuto'],
  }),
  p(4106, 'pedalMode', 'Pedal Mode', 'performance', 'enum', 0, 1, {
    labels: ['Normal', 'Reverse'],
  }),
  p(4107, 'altTunings', 'Alt Tunings', 'performance', 'continuous', 0, 15),
  p(4108, 'velResponse', 'Velocity Response', 'performance', 'continuous', 0, 7),
  p(4109, 'aftertouchResponse', 'Aftertouch Response', 'performance', 'continuous', 0, 7),
]

export const GLOBAL_BY_ID: ReadonlyMap<string, Parameter> = new Map(
  GLOBAL_PARAMETERS.map((x) => [x.id, x]),
)
