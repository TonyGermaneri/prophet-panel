/**
 * Size the host window to the instrument.
 *
 * The keyboard panel and the desktop module are different shapes — 2653×1137 against 3410×1232 —
 * and the panel is drawn to fit inside whatever it is given, centred. So a window sized for one
 * leaves a band of empty felt under the other, which is the thing this removes.
 *
 * Only the height is decided here. The width is the user's, and the panel is happy at any of them.
 */

import { type RefObject, useEffect, useRef } from 'react'

import { platform } from '@platform'

/** Below this the difference is not worth a resize, and chasing it can oscillate. */
const TOLERANCE_PX = 2

/**
 * Below this, nothing has been laid out yet and the measurement is meaningless.
 *
 * This is not defensive padding. The panel is an SVG that takes its height from its own
 * proportions once the browser has placed it; measure a frame too early and every number is zero,
 * and a window sized from zero collapses to the smallest the host will allow. Which is exactly
 * what it did.
 */
const LAID_OUT_PX = 200

/** Returns false when the page is not ready to be measured, so the caller can try again. */
function fit(stage: HTMLElement): boolean {
  const resize = platform.resizeWindow
  if (resize === undefined) return true

  const last = stage.lastElementChild
  if (last === null) return true

  if (window.innerWidth < LAID_OUT_PX || window.innerHeight < LAID_OUT_PX) return false

  const stageBox = stage.getBoundingClientRect()
  const contentBottom = last.getBoundingClientRect().bottom

  if (contentBottom - stageBox.top < LAID_OUT_PX) return false

  const overflow = stage.scrollHeight - stage.clientHeight

  // Two directions, measured two ways. When the instrument does not fit, the box already knows how
  // much taller it needs to be, and scrollHeight says so regardless of where it happens to be
  // scrolled to. When it does fit, scrollHeight is pinned to the box height and says nothing — so
  // the gap has to be measured from where the content actually ends.
  const slack =
    overflow > 0
      ? -overflow
      : stageBox.bottom -
        (contentBottom + Number.parseFloat(getComputedStyle(stage).paddingBottom || '0'))


  if (Math.abs(slack) >= TOLERANCE_PX) {
    resize(Math.round(window.innerWidth), Math.round(window.innerHeight - slack))
  }

  return true
}

/**
 * `signature` should change exactly when the instrument changes shape. It is deliberately not the
 * window size: a height the user chose by dragging is theirs to keep, and re-fitting on every
 * layout would take it back off them.
 */
export function useFitWindow(stage: RefObject<HTMLElement | null>, signature: string): void {
  // A window reopened at a remembered size is already the size someone asked for, so the first
  // pass is skipped. Every later one is a genuine change of instrument.
  const honourRestored = useRef(platform.windowSizeRestored === true)

  useEffect(() => {
    if (honourRestored.current) {
      honourRestored.current = false
      return
    }

    const element = stage.current
    if (element === null || platform.resizeWindow === undefined) return

    // Fit once, as soon as there is something real to measure. The observer is how "as soon as"
    // is known: the panel gets its height when the browser lays it out, which is some frames after
    // this effect runs and is not worth guessing at.
    let settled = false
    const attempt = () => {
      if (!settled && fit(element)) settled = true
    }

    const observer = new ResizeObserver(attempt)
    observer.observe(element)

    const frame = requestAnimationFrame(attempt)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [signature, stage])
}
