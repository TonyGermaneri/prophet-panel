/**
 * What the MIDI specification calls each control change.
 *
 * A binding records the number a controller sent, because that is the only thing that identifies it
 * on the wire. "CC 74" is no help at all when you are looking at a row of eight identical knobs, so
 * the number is shown with the name the spec gives it — which is what a controller's manual prints
 * and what its factory mapping usually follows.
 *
 * Only the assignments the spec actually defines are named. Controllers are free to send anything,
 * and a great many use the undefined ranges (3, 9, 14-15, 20-31, 102-119); inventing a name for
 * those would be a guess dressed up as information, so they stay bare numbers.
 */

/** The defined controllers below 32. Each has a matching LSB half at `number + 32`. */
const COARSE: Record<number, string> = {
  0: 'Bank Select',
  1: 'Modulation Wheel',
  2: 'Breath Controller',
  4: 'Foot Controller',
  5: 'Portamento Time',
  6: 'Data Entry',
  7: 'Channel Volume',
  8: 'Balance',
  10: 'Pan',
  11: 'Expression',
  12: 'Effect Control 1',
  13: 'Effect Control 2',
  16: 'General Purpose 1',
  17: 'General Purpose 2',
  18: 'General Purpose 3',
  19: 'General Purpose 4',
}

/** Switches, sound controllers, effect depths and channel mode messages, which have no LSB half. */
const SINGLE: Record<number, string> = {
  64: 'Sustain Pedal',
  65: 'Portamento',
  66: 'Sostenuto',
  67: 'Soft Pedal',
  68: 'Legato Footswitch',
  69: 'Hold 2',
  70: 'Sound Variation',
  71: 'Resonance',
  72: 'Release Time',
  73: 'Attack Time',
  74: 'Brightness',
  75: 'Decay Time',
  76: 'Vibrato Rate',
  77: 'Vibrato Depth',
  78: 'Vibrato Delay',
  79: 'Sound Control 10',
  80: 'General Purpose 5',
  81: 'General Purpose 6',
  82: 'General Purpose 7',
  83: 'General Purpose 8',
  84: 'Portamento Control',
  88: 'High Resolution Velocity',
  91: 'Reverb Send',
  92: 'Tremolo Depth',
  93: 'Chorus Send',
  94: 'Detune Depth',
  95: 'Phaser Depth',
  96: 'Data Increment',
  97: 'Data Decrement',
  98: 'NRPN LSB',
  99: 'NRPN MSB',
  100: 'RPN LSB',
  101: 'RPN MSB',
  120: 'All Sound Off',
  121: 'Reset All Controllers',
  122: 'Local Control',
  123: 'All Notes Off',
  124: 'Omni Mode Off',
  125: 'Omni Mode On',
  126: 'Mono Mode On',
  127: 'Poly Mode On',
}

/**
 * The spec's name for a control change, or undefined where it defines none.
 *
 * 32-63 are the fine halves of 0-31, so they are named from their coarse partner rather than listed
 * again — and a controller that sends one alone is far more likely to be sending its own idea of
 * that number than half of a 14-bit pair, which is why the LSB is marked rather than hidden.
 */
export function ccName(number: number): string | undefined {
  if (!Number.isInteger(number) || number < 0 || number > 127) return undefined
  if (number >= 32 && number < 64) {
    const coarse = COARSE[number - 32]
    return coarse && `${coarse} LSB`
  }
  return COARSE[number] ?? SINGLE[number]
}

/** The name and number together, for anywhere a control change has to identify itself. */
export function describeCc(number: number): string {
  const name = ccName(number)
  return name ? `${name} · CC ${number}` : `CC ${number}`
}
