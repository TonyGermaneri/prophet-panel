/**
 * A corner to drag the window by.
 *
 * A plug-in editor already has a resizer — JUCE puts one at the bottom right and marks it always
 * on top. That ranking only holds among lightweight components, and the panel is a native WebView,
 * which draws over all of them. So the resizer is there, correctly positioned, permanently
 * invisible and impossible to click. This is the same gesture, drawn by the thing covering it.
 *
 * Absent in the browser, where the page does not own a window to resize.
 */

import { type PointerEvent as ReactPointerEvent, useRef } from 'react'

import { platform } from '@platform'

interface DragOrigin {
  x: number
  y: number
  width: number
  height: number
}

export function ResizeGrip() {
  const origin = useRef<DragOrigin | null>(null)

  const resize = platform.resizeWindow
  if (resize === undefined) return null

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    // Screen coordinates rather than client ones. The window is about to change size underneath
    // the pointer, so anything measured against the window measures against a moving frame and
    // the drag accelerates away from the cursor.
    origin.current = {
      x: event.screenX,
      y: event.screenY,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = origin.current
    if (from === null) return

    resize(
      Math.round(from.width + (event.screenX - from.x)),
      Math.round(from.height + (event.screenY - from.y)),
    )
  }

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    origin.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className="resize-grip"
      title="Drag to resize"
      aria-hidden="true"
      onPointerDown={begin}
      onPointerMove={drag}
      onPointerUp={end}
      onPointerCancel={end}
    />
  )
}
