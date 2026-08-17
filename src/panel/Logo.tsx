import { LOGO_PLATE } from './layout'

/**
 * The nameplate on the lower right of the chassis.
 *
 * TO DROP IN A REAL LOGO: replace the <text> below with the paths from your SVG, wrapped in a
 * <g> that maps your artwork's coordinate space onto the plate. If your SVG has viewBox
 * "0 0 W H", this transform places it centred with a small inset:
 *
 *   const scale = Math.min(LOGO_PLATE.w * 0.86 / W, LOGO_PLATE.h * 0.7 / H)
 *   <g transform={`translate(${cx - (W * scale) / 2},${cy - (H * scale) / 2}) scale(${scale})`}>
 *     …your <path> elements, fill="currentColor"…
 *   </g>
 *
 * Keep `fill="currentColor"` on the paths so the colour stays driven by `.nameplate` in panel.css
 * and the artwork inherits the plate's finish rather than carrying its own hard-coded colour.
 */
export function Logo() {
  const cx = LOGO_PLATE.x + LOGO_PLATE.w / 2
  const cy = LOGO_PLATE.y + LOGO_PLATE.h / 2

  return (
    <g className="nameplate">
      <rect
        x={LOGO_PLATE.x}
        y={LOGO_PLATE.y}
        width={LOGO_PLATE.w}
        height={LOGO_PLATE.h}
        rx={8}
      />
      <text x={cx} y={cy} dy="0.35em">
        prophet~10
      </text>
    </g>
  )
}
