/**
 * The app's icons. Stroke-based on a 24x24 grid, inheriting `currentColor`, so they sit
 * consistently beside each other and follow the button's colour without extra styling.
 *
 * The cog's teeth are generated rather than drawn, which keeps them evenly spaced by construction.
 */

const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function GearIcon() {
  const teeth = 8
  const inner = 7.1
  const outer = 9.7
  return (
    <svg className="icon" {...SVG_PROPS}>
      <circle cx="12" cy="12" r="3.3" />
      <circle cx="12" cy="12" r={inner} />
      {Array.from({ length: teeth }, (_, i) => {
        const a = (i / teeth) * Math.PI * 2
        const [dx, dy] = [Math.cos(a), Math.sin(a)]
        return (
          <line
            key={i}
            x1={12 + dx * inner}
            y1={12 + dy * inner}
            x2={12 + dx * outer}
            y2={12 + dy * outer}
          />
        )
      })}
    </svg>
  )
}

export function BookIcon() {
  return (
    <svg className="icon" {...SVG_PROPS}>
      <path d="M12 6.1C10 4.6 6.8 4.2 4 4.8v13.8c2.8-.6 6-.2 8 1.3" />
      <path d="M12 6.1C14 4.6 17.2 4.2 20 4.8v13.8c-2.8-.6-6-.2-8 1.3" />
      <path d="M12 6.1v13.8" />
    </svg>
  )
}

/** A chain link: two controls joined together is what a binding is. */
export function LinkIcon() {
  return (
    <svg className="icon" {...SVG_PROPS}>
      <path d="M10.1 13.9a3.9 3.9 0 0 1 0-5.5l2-2a3.9 3.9 0 0 1 5.5 5.5l-1 1" />
      <path d="M13.9 10.1a3.9 3.9 0 0 1 0 5.5l-2 2a3.9 3.9 0 0 1-5.5-5.5l1-1" />
    </svg>
  )
}

export function PianoIcon() {
  // Black keys sit on the joins between whites, as they do on the instrument.
  const whites = 4
  const width = 17
  const step = width / whites
  return (
    <svg className="icon" {...SVG_PROPS}>
      <rect x="3.5" y="5.5" width={width} height="13" rx="1.6" />
      {Array.from({ length: whites - 1 }, (_, i) => {
        const x = 3.5 + step * (i + 1)
        return (
          <g key={i}>
            <line x1={x} y1="12.5" x2={x} y2="18.5" />
            <rect
              x={x - 1.5}
              y="5.5"
              width="3"
              height="7"
              rx="0.6"
              fill="currentColor"
              stroke="none"
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Library group actions. Read as a row of five at around fifteen pixels, so they are drawn for
 * silhouette rather than detail: a circle, an upright page, a tray, a diagonal and a tapered can
 * stay apart from each other at that size in a way five variations on a box would not.
 */

/** Adding what is already loaded: no file involved, so no page in it. */
export function PlusCircleIcon() {
  return (
    <svg className="icon" {...SVG_PROPS}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </svg>
  )
}

export function FilePlusIcon() {
  return (
    <svg className="icon" {...SVG_PROPS}>
      <path d="M13.4 3.9H7.3a1.7 1.7 0 0 0-1.7 1.7v12.8a1.7 1.7 0 0 0 1.7 1.7h9.4a1.7 1.7 0 0 0 1.7-1.7V8.6z" />
      <path d="M13.4 3.9v4.7h4.9" />
      <path d="M12 11.9v5.2M9.4 14.5h5.2" />
    </svg>
  )
}

/** Out of the tray and away, which is what an export is. */
export function ExportIcon() {
  return (
    <svg className="icon" {...SVG_PROPS}>
      <path d="M12 15V4.7" />
      <path d="M8.3 8.4 12 4.7l3.7 3.7" />
      <path d="M4.9 14.3V18a1.8 1.8 0 0 0 1.8 1.8h10.6a1.8 1.8 0 0 0 1.8-1.8v-3.7" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg className="icon" {...SVG_PROPS}>
      <path d="M4.8 19.2h3.4L18.6 8.8a1.9 1.9 0 0 0 0-2.7l-.7-.7a1.9 1.9 0 0 0-2.7 0L4.8 15.8z" />
      <path d="m14.4 6.8 2.8 2.8" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg className="icon" {...SVG_PROPS}>
      <path d="M4.8 6.9h14.4" />
      <path d="M9.7 6.9V5.3a1.4 1.4 0 0 1 1.4-1.4h1.8a1.4 1.4 0 0 1 1.4 1.4v1.6" />
      <path d="m6.7 6.9.8 11.9a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.8-11.9" />
      <path d="M10.4 10.5v6.3M13.6 10.5v6.3" />
    </svg>
  )
}
