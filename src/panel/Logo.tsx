import { LOGO_PATHS, LOGO_VIEWBOX } from './logoPaths'
import { type Box, LOGO_PLATE } from './layout'

/** Inset of the artwork within the plate, as a fraction of the plate's size. */
const FILL = { x: 0.86, y: 0.62 }

/**
 * The nameplate on the lower right of the chassis.
 *
 * The artwork is scaled to fit the plate on whichever axis is tighter and centred, so changing
 * either the plate geometry or the logo file cannot make it overflow. Paths inherit
 * `currentColor` from `.nameplate` in panel.css rather than carrying their own colour.
 */
export function Logo({ box = LOGO_PLATE, plate = true }: { box?: Box; plate?: boolean } = {}) {
  // Without a plate the artwork fills its box; on a plate it is inset so metal shows around it.
  const fill = plate ? FILL : { x: 1, y: 1 }
  const scale = Math.min(
    (box.w * fill.x) / LOGO_VIEWBOX.width,
    (box.h * fill.y) / LOGO_VIEWBOX.height,
  )
  const x = box.x + (box.w - LOGO_VIEWBOX.width * scale) / 2
  const y = box.y + (box.h - LOGO_VIEWBOX.height * scale) / 2

  return (
    <g className={plate ? 'nameplate' : 'nameplate bare'}>
      {plate && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} />}
      <g className="nameplate-art" transform={`translate(${x},${y}) scale(${scale})`}>
        {LOGO_PATHS.map((d, i) => (
          <path key={i} d={d} fill="currentColor" />
        ))}
      </g>
    </g>
  )
}
