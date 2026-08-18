import { modelName, otherModel, type SynthModel } from '../domain/model'
import { settings } from '../state/settings'
import { useSettings } from '../ui/useBindings'
import { type Box, LOGO_PLATE } from './layout'
import { LOGO_ART } from './logoPaths'

/** Inset of the artwork within the plate, as a fraction of the plate's size. */
const FILL = { x: 0.86, y: 0.62 }

/**
 * The nameplate.
 *
 * Clicking it swaps the instrument the panel is dressed as, which is the whole of the difference
 * between the two: the Prophet-5 and Prophet-10 Rev4 share a faceplate, a parameter set and a
 * sysex format, so nothing behind the logo needs to know which one is showing.
 *
 * The artwork is scaled to fit the plate on whichever axis is tighter and centred, so changing
 * either the plate geometry or the logo file cannot make it overflow. Paths inherit `currentColor`
 * from `.nameplate` in panel.css rather than carrying their own colour, which is what lets the same
 * artwork read as etched metal on the keyboard and as silkscreen on the desktop module.
 */
export function Logo({ box = LOGO_PLATE, plate = true }: { box?: Box; plate?: boolean } = {}) {
  const model: SynthModel = useSettings().model
  const art = LOGO_ART[model] ?? LOGO_ART['prophet-10']
  const next = otherModel(model)

  // Without a plate the artwork fills its box; on a plate it is inset so metal shows around it.
  const fill = plate ? FILL : { x: 1, y: 1 }
  const scale = Math.min(
    (box.w * fill.x) / art.viewBox.width,
    (box.h * fill.y) / art.viewBox.height,
  )
  const x = box.x + (box.w - art.viewBox.width * scale) / 2
  const y = box.y + (box.h - art.viewBox.height * scale) / 2

  const swap = () => settings.update({ model: next })
  const label = `${modelName(model)} — click to switch to the ${modelName(next)}`

  return (
    <g
      className={plate ? 'nameplate' : 'nameplate bare'}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={swap}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          swap()
          e.preventDefault()
        }
      }}
    >
      {plate && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} />}
      {/* Translate by the ink's own offset, so a padded artboard still lands where it is placed. */}
      <g
        className="nameplate-art"
        transform={`translate(${x},${y}) scale(${scale}) translate(${-art.viewBox.x},${-art.viewBox.y})`}
      >
        {art.paths.map((d, i) => (
          <path key={i} d={d} fill="currentColor" />
        ))}
      </g>
      {/* A transparent hit area, so the click target is the whole plate rather than the glyphs. */}
      <rect
        className="nameplate-hit"
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={8}
      />
      <title>{label}</title>
    </g>
  )
}
