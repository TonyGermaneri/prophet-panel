/**
 * Performance events (notes, wheels) raised by the on-screen keyboard.
 *
 * The keyboard should not import the MIDI layer directly — it would drag a browser-only module
 * into every render path and make the component untestable. Instead the MIDI layer registers
 * itself here at startup.
 */

export interface PerformanceSink {
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  pitchBend(value: number): void
  modWheel(value: number): void
}

const noop: PerformanceSink = {
  noteOn: () => {},
  noteOff: () => {},
  pitchBend: () => {},
  modWheel: () => {},
}

let sink: PerformanceSink = noop

export function setPerformanceSink(next: PerformanceSink | null): void {
  sink = next ?? noop
}

export const performance: PerformanceSink = {
  noteOn: (n, v) => sink.noteOn(n, v),
  noteOff: (n) => sink.noteOff(n),
  pitchBend: (v) => sink.pitchBend(v),
  modWheel: (v) => sink.modWheel(v),
}
