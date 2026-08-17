import { useEffect, useRef } from 'react'

const MANUAL_URL = 'https://sequential.com/wp-content/uploads/2021/02/Prophet-5-Users-Guide-1.3.pdf'
const REPO_URL = 'https://github.com/TonyGermaneri/prophet-panel'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="about-backdrop" onPointerDown={onClose}>
      <div
        className="about"
        role="dialog"
        aria-modal="true"
        aria-label="About"
        tabIndex={-1}
        ref={panel}
        // The backdrop closes on click; clicks inside the card must not bubble up to it.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className="about-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>Prophet-10 Control Panel</h2>
        <p className="byline">By Tony Germaneri</p>

        <p className="about-blurb">
          A browser control surface for the Sequential Prophet-10 Rev4 — play it, edit it, and
          load, save, send and sync patches over MIDI.
        </p>

        <ul className="about-links">
          <li>
            <a href={MANUAL_URL} target="_blank" rel="noopener noreferrer">
              Prophet-5 User’s Guide (PDF)
            </a>
            <span>The instrument manual, from Sequential</span>
          </li>
          <li>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              github.com/TonyGermaneri/prophet-panel
            </a>
            <span>Source code</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
