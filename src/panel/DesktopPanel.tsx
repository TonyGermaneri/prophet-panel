import { bankOf, programInBank } from '../domain/patch'
import { usePatchMeta } from '../state/hooks'
import { Defs } from './Defs'
import { Knob } from './Knob'
import { Logo } from './Logo'
import { Switch } from './Switch'
import { DESKTOP_METRICS, MetricsProvider } from './metrics'
import {
  DESKTOP_BRACKETS,
  DESKTOP_CHASSIS,
  DESKTOP_CHEEKS,
  DESKTOP_DISPLAY,
  DESKTOP_KNOBS,
  DESKTOP_LOGO,
  DESKTOP_PANEL,
  DESKTOP_PLATE,
  DESKTOP_SECTIONS,
  DESKTOP_SHIFT_LABELS,
  DESKTOP_SHIFT_LABEL_Y,
  DESKTOP_SHIFT_LAMPS,
  DESKTOP_SWITCHES,
} from './desktopLayout'
import './panel.css'

function SectionFrame({ title, box }: { title: string; box: (typeof DESKTOP_SECTIONS)[number]['box'] }) {
  const cx = box.x + box.w / 2
  const halfText = (title.length * 13.5) / 2 + 14
  return (
    <g className="section">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={16} />
      {/* Mask the top rule where the legend sits, rather than drawing two part-rules. */}
      <rect
        className="section-title-mask"
        x={cx - halfText}
        y={box.y - 16}
        width={halfText * 2}
        height={32}
      />
      <text className="section-title" x={cx} y={box.y} dy="0.34em">
        {title}
      </text>
    </g>
  )
}

function Bracket({ x1, x2, y, text }: (typeof DESKTOP_BRACKETS)[number]) {
  const cx = (x1 + x2) / 2
  const half = (text.length * 12) / 2 + 12
  return (
    <g className="bracket">
      <line x1={x1} y1={y} x2={cx - half} y2={y} />
      <line x1={cx + half} y1={y} x2={x2} y2={y} />
      <text x={cx} y={y} dy="0.34em">
        {text}
      </text>
    </g>
  )
}

function Display() {
  const { group, program } = usePatchMeta()
  const digits = `${group + 1}${bankOf(program)}${programInBank(program)}`
  return (
    <g className="display">
      <rect
        x={DESKTOP_DISPLAY.x}
        y={DESKTOP_DISPLAY.y}
        width={DESKTOP_DISPLAY.w}
        height={DESKTOP_DISPLAY.h}
        rx={5}
      />
      <text
        x={DESKTOP_DISPLAY.x + DESKTOP_DISPLAY.w / 2}
        y={DESKTOP_DISPLAY.y + DESKTOP_DISPLAY.h / 2}
        dy="0.35em"
      >
        {digits}
      </text>
      <text
        className="display-legend"
        x={DESKTOP_DISPLAY.x + DESKTOP_DISPLAY.w / 2}
        y={DESKTOP_DISPLAY.y + DESKTOP_DISPLAY.h + 26}
      >
        GROUP|BANK|PRGM
      </text>
    </g>
  )
}

/**
 * The desktop module: the same instrument in different furniture. Four rows rather than three,
 * modulation across the top, the logo printed straight onto the plate, and wood surviving only as
 * the two end cheeks. Every control id matches the keyboard layout, so bindings, parameters and
 * MIDI all work unchanged.
 */
export function DesktopPanel() {
  return (
    <MetricsProvider value={DESKTOP_METRICS}>
      <svg
        className="prophet-panel desktop"
        viewBox={`0 0 ${DESKTOP_PANEL.width} ${DESKTOP_PANEL.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Prophet-10 desktop module"
      >
        <Defs />

        <rect
          className="chassis"
          x={DESKTOP_CHASSIS.x}
          y={DESKTOP_CHASSIS.y}
          width={DESKTOP_CHASSIS.w}
          height={DESKTOP_CHASSIS.h}
          rx={10}
        />

        {/* Wood only at the ends, so the grain is drawn per cheek rather than across the whole box. */}
        {DESKTOP_CHEEKS.map((cheek, i) => (
          <g key={i}>
            <rect className="chassis" {...cheek} rx={6} />
            <rect className="chassis-grain-a" {...cheek} rx={6} />
            <rect className="chassis-grain-b" {...cheek} rx={6} />
            <rect className="cheek-shade" {...cheek} rx={6} />
          </g>
        ))}

        <rect
          className="plate"
          x={DESKTOP_PLATE.x}
          y={DESKTOP_PLATE.y}
          width={DESKTOP_PLATE.w}
          height={DESKTOP_PLATE.h}
          rx={4}
        />
        <rect
          className="plate-texture"
          x={DESKTOP_PLATE.x}
          y={DESKTOP_PLATE.y}
          width={DESKTOP_PLATE.w}
          height={DESKTOP_PLATE.h}
          rx={4}
        />

        {DESKTOP_SECTIONS.map((s) => (
          <SectionFrame key={s.id} title={s.title} box={s.box} />
        ))}
        {DESKTOP_BRACKETS.map((b, i) => (
          <Bracket key={i} {...b} />
        ))}

        {DESKTOP_SHIFT_LABELS.map((s) => (
          <g key={s.x} className="shift-label">
            <text x={s.x} y={DESKTOP_SHIFT_LABEL_Y.top}>
              {s.top}
            </text>
            {s.bottom && (
              <text x={s.x} y={DESKTOP_SHIFT_LABEL_Y.bottom}>
                {s.bottom}
              </text>
            )}
          </g>
        ))}

        {/* The pair of lamps marking which row of shifted legends is active. */}
        <g className="led on">
          <circle className="led-body" cx={DESKTOP_SHIFT_LAMPS.x} cy={DESKTOP_SHIFT_LAMPS.top} r={5} />
        </g>
        <g className="led">
          <circle
            className="led-body amber"
            cx={DESKTOP_SHIFT_LAMPS.x}
            cy={DESKTOP_SHIFT_LAMPS.bottom}
            r={5}
          />
        </g>

        <Display />

        {DESKTOP_KNOBS.map((k) => (
          <Knob key={k.param} spec={k} />
        ))}
        {DESKTOP_SWITCHES.map((s) => (
          <Switch key={s.param} spec={s} />
        ))}

        <Logo box={DESKTOP_LOGO} plate={false} />
      </svg>
    </MetricsProvider>
  )
}
