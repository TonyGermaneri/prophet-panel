import { useSyncExternalStore } from 'react'

import { notes } from '../state/notes'
import { KEYBOARD } from './layout'

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11])

interface Key {
  note: number
  x: number
  white: boolean
}

/** 61 keys from C2: white keys tile left to right, black keys straddle the joins. */
function buildKeys(): Key[] {
  const keys: Key[] = []
  let whiteIndex = 0
  for (let i = 0; i < 61; i++) {
    const note = KEYBOARD.firstMidiNote + i
    const white = WHITE_PITCH_CLASSES.has(note % 12)
    if (white) {
      keys.push({ note, x: KEYBOARD.x + whiteIndex * KEYBOARD.whiteWidth, white })
      whiteIndex++
    } else {
      keys.push({
        note,
        x: KEYBOARD.x + whiteIndex * KEYBOARD.whiteWidth - KEYBOARD.blackWidth / 2,
        white,
      })
    }
  }
  return keys
}

const KEYS = buildKeys()

export function Keyboard() {
  // Shared with the computer keyboard, so both light the same keys.
  const held = useSyncExternalStore(
    (fn) => notes.subscribe(fn),
    () => notes.held,
    () => notes.held,
  )

  const press = (note: number) => notes.noteOn(note, 100)
  const release = (note: number) => notes.noteOff(note)

  const keyProps = (note: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      press(note)
    },
    onPointerUp: () => release(note),
    onPointerLeave: () => release(note),
    // Dragging across the keyboard glissandos, which is how a real one behaves.
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.buttons === 1) press(note)
    },
  })

  return (
    <g className="keyboard">
      {KEYS.filter((k) => k.white).map((k) => (
        <rect
          key={k.note}
          className={held.has(k.note) ? 'white-key held' : 'white-key'}
          x={k.x}
          y={KEYBOARD.y}
          width={KEYBOARD.whiteWidth - 2}
          height={KEYBOARD.h}
          rx={4}
          {...keyProps(k.note)}
        />
      ))}
      {KEYS.filter((k) => !k.white).map((k) => (
        <rect
          key={k.note}
          className={held.has(k.note) ? 'black-key held' : 'black-key'}
          x={k.x}
          y={KEYBOARD.y}
          width={KEYBOARD.blackWidth}
          height={KEYBOARD.blackHeight}
          rx={3}
          {...keyProps(k.note)}
        />
      ))}
    </g>
  )
}
