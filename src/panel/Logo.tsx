import { LOGO_PATHS, LOGO_VIEWBOX } from './logoPaths'
import { LOGO_PLATE } from './layout'

/** Inset of the artwork within the plate, as a fraction of the plate's size. */
const FILL = { x: 0.86, y: 0.62 }

/**
 * The nameplate on the lower right of the chassis.
 *
 * The artwork is scaled to fit the plate on whichever axis is tighter and centred, so changing
 * either the plate geometry or the logo file cannot make it overflow. Paths inherit
 * `currentColor` from `.nameplate` in panel.css rather than carrying their own colour.
 */
export function Logo() {
  const scale = Math.min(
    (LOGO_PLATE.w * FILL.x) / LOGO_VIEWBOX.width,
    (LOGO_PLATE.h * FILL.y) / LOGO_VIEWBOX.height,
  )
  const x = LOGO_PLATE.x + (LOGO_PLATE.w - LOGO_VIEWBOX.width * scale) / 2
  const y = LOGO_PLATE.y + (LOGO_PLATE.h - LOGO_VIEWBOX.height * scale) / 2

  return (
    <g className="nameplate">
      <rect x={LOGO_PLATE.x} y={LOGO_PLATE.y} width={LOGO_PLATE.w} height={LOGO_PLATE.h} rx={8} />
      <g className="nameplate-art" transform={`translate(${x},${y}) scale(${scale})`}>
        {LOGO_PATHS.map((d, i) => (
          <path key={i} d={d} fill="currentColor" />
        ))}
      </g>
    </g>
  )
}
