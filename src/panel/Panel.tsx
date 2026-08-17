import { Defs } from './Defs'
import { DesktopPanel } from './DesktopPanel'
import { Keyboard } from './Keyboard'
import { Knob } from './Knob'
import { Logo } from './Logo'
import { Switch } from './Switch'
import {
  BRACKETS,
  CHASSIS,
  DISPLAY,
  KNOBS,
  PANEL,
  PLATE,
  SECTIONS,
  SHIFT_LABELS,
  SHIFT_LABEL_Y,
  WHEEL_PANEL,
  KEYBOARD,
  SWITCHES,
  WHEELS,
} from './layout'
import { usePatchMeta } from '../state/hooks'
import { bankOf, displayGroup, programInBank } from '../domain/patch'
import './panel.css'

/** Section outline with its legend breaking the top rule, as printed on the faceplate. */
function SectionFrame({ title, box }: { title: string; box: (typeof SECTIONS)[number]['box'] }) {
  const cx = box.x + box.w / 2
  // Clear just enough rule for the legend: roughly one glyph advance per character, plus margin.
  const halfText = (title.length * 10.4) / 2 + 11
  return (
    <g className="section">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={22} />
      {/* Mask the top rule where the legend sits, rather than drawing two part-rules. */}
      <rect
        className="section-title-mask"
        x={cx - halfText}
        y={box.y - 14}
        width={halfText * 2}
        height={28}
      />
      <text className="section-title" x={cx} y={box.y} dy="0.34em">
        {title}
      </text>
    </g>
  )
}

function Bracket({ x1, x2, y, text }: (typeof BRACKETS)[number]) {
  const cx = (x1 + x2) / 2
  const half = (text.length * 9.2) / 2 + 10
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

/** Three-digit readout: group, bank, program. */
function Display() {
  const { group, program } = usePatchMeta()
  const digits = `${displayGroup(group)}${bankOf(program)}${programInBank(program)}`
  return (
    <g className="display">
      <rect x={DISPLAY.x} y={DISPLAY.y} width={DISPLAY.w} height={DISPLAY.h} rx={5} />
      <text x={DISPLAY.x + DISPLAY.w / 2} y={DISPLAY.y + DISPLAY.h / 2} dy="0.35em">
        {digits}
      </text>
      <text className="display-legend" x={DISPLAY.x + DISPLAY.w / 2} y={DISPLAY.y + DISPLAY.h + 22}>
        GROUP|BANK|PRGM
      </text>
    </g>
  )
}

function Wheel({ wheel }: { wheel: (typeof WHEELS)['pitch'] }) {
  const ribs = 11
  return (
    <g className="wheel">
      <rect x={wheel.x} y={wheel.y} width={wheel.w} height={wheel.h} rx={9} />
      {Array.from({ length: ribs }, (_, i) => {
        const y = wheel.y + 10 + (i * (wheel.h - 20)) / (ribs - 1)
        return <line key={i} x1={wheel.x + 5} y1={y} x2={wheel.x + wheel.w - 5} y2={y} />
      })}
      <text className="wheel-label" x={wheel.x + wheel.w / 2} y={wheel.y + wheel.h + 30}>
        {wheel.label}
      </text>
    </g>
  )
}

export function Panel({ compact = false }: { compact?: boolean }) {
  // Without the keyboard this is a different instrument entirely — the desktop module, which has
  // its own arrangement rather than the keyboard panel with its lower half cropped off.
  if (compact) return <DesktopPanel />

  const height = PANEL.height
  const chassisHeight = CHASSIS.h

  return (
    <svg
      className="prophet-panel"
      viewBox={`0 0 ${PANEL.width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Prophet-10 front panel"
    >
      <Defs />

      {/* Chassis */}
      <rect
        className="chassis"
        x={CHASSIS.x}
        y={CHASSIS.y}
        width={CHASSIS.w}
        height={chassisHeight}
        rx={16}
      />
      <rect
        className="chassis-grain-a"
        x={CHASSIS.x}
        y={CHASSIS.y}
        width={CHASSIS.w}
        height={chassisHeight}
        rx={16}
      />
      <rect
        className="chassis-grain-b"
        x={CHASSIS.x}
        y={CHASSIS.y}
        width={CHASSIS.w}
        height={chassisHeight}
        rx={16}
      />

      <rect
        className="chassis-vignette"
        x={CHASSIS.x}
        y={CHASSIS.y}
        width={CHASSIS.w}
        height={chassisHeight}
        rx={16}
      />

      <rect
        className="chassis-edge"
        x={CHASSIS.x + 2}
        y={CHASSIS.y + 2}
        width={CHASSIS.w - 4}
        height={chassisHeight - 4}
        rx={15}
      />

      {/* Faceplate */}
      <rect className="plate" x={PLATE.x} y={PLATE.y} width={PLATE.w} height={PLATE.h} rx={10} />
      <rect
        className="plate-texture"
        x={PLATE.x}
        y={PLATE.y}
        width={PLATE.w}
        height={PLATE.h}
        rx={10}
      />

      {SECTIONS.map((s) => (
        <SectionFrame key={s.id} title={s.title} box={s.box} />
      ))}
      {BRACKETS.map((b, i) => (
        <Bracket key={i} {...b} />
      ))}

      {/* Shifted globals legends above the program-select row. */}
      {SHIFT_LABELS.map((s) => (
        <g key={s.x} className="shift-label">
          <text x={s.x} y={SHIFT_LABEL_Y.top}>
            {s.top}
          </text>
          {s.bottom && (
            <text x={s.x} y={SHIFT_LABEL_Y.bottom}>
              {s.bottom}
            </text>
          )}
        </g>
      ))}

      <Display />

      {KNOBS.map((k) => (
        <Knob key={k.param} spec={k} />
      ))}
      {SWITCHES.map((s) => (
        <Switch key={s.param} spec={s} />
      ))}

      {!compact && (
        <>
          <Logo />

          {/* The wheels sit on a black bed beside the keys, not on the wood. */}
          <rect
            className="wheel-bed"
            x={WHEEL_PANEL.x}
            y={WHEEL_PANEL.y}
            width={WHEEL_PANEL.w}
            height={WHEEL_PANEL.h}
            rx={4}
          />
          <Wheel wheel={WHEELS.pitch} />
          <Wheel wheel={WHEELS.mod} />
          <Keyboard />

          {/* Shadowed underside of the wood where it overhangs the keybed. */}
          <rect
            className="wood-lip"
            x={CHASSIS.x}
            y={KEYBOARD.y - 22}
            width={CHASSIS.w}
            height={22}
          />
        </>
      )}
    </svg>
  )
}
