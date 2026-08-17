import { useEffect, useState } from 'react'

import { notes } from '../state/notes'

/**
 * The familiar two-row tracker layout: the home row is the white keys and the row above holds the
 * sharps, so `a` is C and `w` is C#. `z` and `x` shift the octave, `c` and `v` the velocity.
 */
const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17,
}

const MIN_OCTAVE = 1
const MAX_OCTAVE = 7

/** Typing in a text field must not play notes. */
function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function useComputerKeyboard(enabled = true): { octave: number; velocity: number } {
  const [octave, setOctave] = useState(4)
  const [velocity, setVelocity] = useState(100)

  useEffect(() => {
    if (!enabled) return

    // Which note each physical key started, so a key released after an octave shift still stops
    // the note it actually began — otherwise shifting mid-chord strands a stuck note.
    const sounding = new Map<string, number>()
    let currentOctave = octave
    let currentVelocity = velocity

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return
      const key = e.key.toLowerCase()

      if (key === 'z' || key === 'x') {
        const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, currentOctave + (key === 'x' ? 1 : -1)))
        currentOctave = next
        setOctave(next)
        e.preventDefault()
        return
      }
      if (key === 'c' || key === 'v') {
        const next = Math.min(127, Math.max(1, currentVelocity + (key === 'v' ? 10 : -10)))
        currentVelocity = next
        setVelocity(next)
        e.preventDefault()
        return
      }

      const semitone = KEY_TO_SEMITONE[key]
      if (semitone === undefined || sounding.has(key)) return
      const note = Math.min(127, currentOctave * 12 + 12 + semitone)
      sounding.set(key, note)
      notes.noteOn(note, currentVelocity)
      e.preventDefault()
    }

    const onUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const note = sounding.get(key)
      if (note === undefined) return
      sounding.delete(key)
      notes.noteOff(note)
    }

    // Losing focus mid-keypress never delivers the keyup, so release everything.
    const onBlur = () => {
      for (const note of sounding.values()) notes.noteOff(note)
      sounding.clear()
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      onBlur()
    }
    // Re-registering on every octave change would drop held notes, so the listener keeps its own
    // copy of the octave and this effect deliberately runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return { octave, velocity }
}
