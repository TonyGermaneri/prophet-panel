import { useSyncExternalStore } from 'react'

import { notes } from '../state/notes'
import { KEYBOARD } from './layout'

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11])

/** Depth of the front lip — the chamfer at the player's edge that catches the light. */
const WHITE_LIP = 15
/** Where a black key's top face turns down toward the front, and how wide that facet reads. */
const BLACK_GLEAM_INSET = 46
const BLACK_GLEAM_HEIGHT = 22

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
const WHITE_W = KEYBOARD.whiteWidth - 2
const BED_RIGHT = KEYBOARD.x + KEYBOARD.whiteKeys * KEYBOARD.whiteWidth

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
      {/* Dark bed behind the keys: the gaps between white keys read as shadow, not as background. */}
      <rect
        className="keybed-back"
        x={KEYBOARD.x - 5}
        y={KEYBOARD.y}
        width={BED_RIGHT - KEYBOARD.x + 10}
        height={KEYBOARD.h}
      />

      {KEYS.filter((k) => k.white).map((k) => (
        <g key={k.note} className={held.has(k.note) ? 'white-key held' : 'white-key'}>
          <rect
            className="white-key-body"
            x={k.x}
            y={KEYBOARD.y}
            width={WHITE_W}
            height={KEYBOARD.h}
            rx={4}
            {...keyProps(k.note)}
          />
          {/* Front chamfer, brighter than the playing surface above it. */}
          <rect
            className="white-key-lip"
            x={k.x}
            y={KEYBOARD.y + KEYBOARD.h - WHITE_LIP}
            width={WHITE_W}
            height={WHITE_LIP}
            rx={4}
          />
          {/* Neighbouring key casts a soft shadow down the left flank. */}
          <rect
            className="white-key-flank"
            x={k.x}
            y={KEYBOARD.y}
            width={5}
            height={KEYBOARD.h}
          />
        </g>
      ))}

      {KEYS.filter((k) => !k.white).map((k) => (
        <g key={k.note} className={held.has(k.note) ? 'black-key held' : 'black-key'}>
          <rect
            className="black-key-body"
            x={k.x}
            y={KEYBOARD.y}
            width={KEYBOARD.blackWidth}
            height={KEYBOARD.blackHeight}
            rx={3}
            {...keyProps(k.note)}
          />
          {/*
            Highlight along the left arris and shading down the right. Full height and matching
            radius, or its lower edge shows as a seam across the key.
          */}
          <rect
            className="black-key-arris"
            x={k.x}
            y={KEYBOARD.y}
            width={KEYBOARD.blackWidth}
            height={KEYBOARD.blackHeight}
            rx={3}
          />
          {/* The gleam where the top face turns down toward the player. */}
          <rect
            className="black-key-gleam"
            x={k.x + 1}
            y={KEYBOARD.y + KEYBOARD.blackHeight - BLACK_GLEAM_INSET}
            width={KEYBOARD.blackWidth - 2}
            height={BLACK_GLEAM_HEIGHT}
            rx={2}
          />
        </g>
      ))}

      {/* The fallboard above throws a shadow across the back of every key. */}
      <rect
        className="keybed-cast"
        x={KEYBOARD.x - 5}
        y={KEYBOARD.y}
        width={BED_RIGHT - KEYBOARD.x + 10}
        height={34}
      />
    </g>
  )
}
