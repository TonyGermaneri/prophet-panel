import { useState } from 'react'

import { BY_ID } from '../domain/parameters'
import { dispatchAction } from '../state/actions'
import { useParam } from '../state/hooks'
import { controlRange } from '../state/store'
import { useBindings } from '../ui/useBindings'
import { accessibleName, type SwitchIcon, type SwitchLayout } from './layout'
import { useMetrics } from './metrics'

/** Waveform glyphs printed above the shape switches. */
function Icon({ kind }: { kind: SwitchIcon }) {
  const paths: Record<SwitchIcon, string> = {
    saw: 'M -13 9 L 13 -9 L 13 9',
    triangle: 'M -13 9 L 0 -9 L 13 9',
    pulse: 'M -13 9 L -13 -9 L 1 -9 L 1 9 L 13 9',
  }
  return <path className="switch-icon" d={paths[kind]} />
}

function ledLit(mode: string, index: number, value: number, min: number): boolean {
  switch (mode) {
    case 'exclusive':
      return value === min + index
    case 'select':
      return value === min + index + 1
    case 'bitmask':
      return (value & (1 << index)) !== 0
    default:
      return value > min
  }
}

export function Switch({ spec }: { spec: SwitchLayout }) {
  const leds = spec.leds ?? 1
  const mode = spec.ledMode ?? 'toggle'

  // A cap wired to `bits` drives one parameter per LED; everything else drives a single parameter.
  const [bitA, setBitA] = useParam(spec.bits?.[0] ?? spec.param)
  const [bitB, setBitB] = useParam(spec.bits?.[1] ?? spec.param)
  const [plain, setPlain] = useParam(spec.param)
  const [flash, setFlash] = useState(false)
  const bind = useBindings()
  const { switchSize, capStyle } = useMetrics()

  const { min, max } = controlRange(spec.bits?.[0] ?? spec.param)
  const value = spec.bits ? (bitA ? 1 : 0) | (bitB ? 2 : 0) : plain
  const range = spec.bits ? { min: 0, max: (1 << leds) - 1 } : { min, max }

  const advance = () => {
    // In bind mode a click selects the control to be learned rather than operating it.
    if (bind.active) {
      bind.select(bind.selected === spec.param ? null : spec.param)
      return
    }
    const next = value >= range.max ? range.min : value + 1
    if (spec.bits) {
      setBitA(next & 1)
      setBitB((next >> 1) & 1)
    } else if (spec.momentary) {
      setFlash(true)
      window.setTimeout(() => setFlash(false), 140)
      if (spec.action) dispatchAction(spec.action)
    } else {
      setPlain(next)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      advance()
      e.preventDefault()
    }
  }

  const label = spec.label?.split('\n') ?? []
  const litValue = spec.momentary && flash ? range.max : value
  // Two-LED caps sit in a wider bezel on the instrument.
  const W = leds > 1 ? switchSize.w * 1.3 : switchSize.w
  const H = switchSize.h

  /**
   * The desktop module's caps are translucent and light across their whole face, so a single-state
   * switch has no separate lamp — the cap is the indicator. Multi-state caps keep their lamps,
   * moved above the cap where the instrument puts them.
   */
  const illuminated = capStyle === 'illuminated'
  const showLamps = !illuminated || leds > 1
  const lampY = illuminated ? -H / 2 - 15 : -H / 2 + 13
  const litFace = illuminated && leds === 1 && litValue > range.min
  const labelLift = illuminated && leds > 1 ? 34 : 10
  /** Lamps and their legends spread with the cap so a wider bezel does not crowd them. */
  const lampSpread = W * 0.28

  // Shape switches carry only a waveform glyph, so their accessible name has to come from the
  // parameter table rather than the (absent) printed legend.
  const domain = BY_ID.get(spec.bits?.[0] ?? spec.param)
  const name = domain
    ? accessibleName(domain.section, spec.bits ? (spec.label ?? domain.name) : domain.name)
    : (spec.label?.replace('\n', ' ') ?? spec.param)

  return (
    <g
      className={[
        'switch',
        spec.cap ? `cap-${spec.cap}` : '',
        litFace ? 'lit' : '',
        bind.active ? 'bindable' : '',
        bind.selected === spec.param ? 'bind-selected' : '',
        bind.active && bind.bindingFor(spec.param) ? 'bound' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${spec.x},${spec.y})`}
      role="button"
      tabIndex={0}
      aria-label={name}
      aria-pressed={value > range.min}
      onKeyDown={onKeyDown}
    >
      {spec.icon && (
        <g transform={`translate(0,${-H / 2 - 18})`}>
          <Icon kind={spec.icon} />
        </g>
      )}

      {label.length > 0 && spec.labelAbove && (
        <text className="switch-label" y={-H / 2 - labelLift} textAnchor="middle">
          {label[0]}
        </text>
      )}

      {spec.ledLabels && (
        <>
          <text className="switch-led-label" x={-lampSpread} y={lampY - 12}>
            {spec.ledLabels[0]}
          </text>
          <text className="switch-led-label" x={lampSpread} y={lampY - 12}>
            {spec.ledLabels[1]}
          </text>
        </>
      )}

      {bind.active && (
        <rect
          className="bind-ring"
          x={-W / 2 - 6}
          y={-H / 2 - 6}
          width={W + 12}
          height={H + 12}
          rx={6}
        />
      )}

      {/* Recessed housing the cap sits in. */}
      <rect className="switch-bezel" x={-W / 2} y={-H / 2} width={W} height={H} rx={3} />

      {showLamps &&
        Array.from({ length: leds }, (_, i) => {
          const cx = leds === 1 ? 0 : (i - (leds - 1) / 2) * lampSpread * 2
          const on = ledLit(mode, i, litValue, range.min)
          return (
            <g key={i} className={on ? 'led on' : 'led'}>
              {on && <circle className="led-bloom" cx={cx} cy={lampY} r={9} />}
              <circle className="led-body" cx={cx} cy={lampY} r={5.2} />
              <circle className="led-gloss" cx={cx - 1.4} cy={lampY - 1.6} r={1.7} />
            </g>
          )
        })}

      <g className={flash ? 'switch-cap pressed' : 'switch-cap'}>
        {illuminated ? (
          /* One translucent moulding filling the bezel, lit from within. */
          <>
            <rect
              className="switch-cap-face"
              x={-W / 2 + 4}
              y={-H / 2 + 4}
              width={W - 8}
              height={H - 8}
              rx={4}
            />
            <rect
              className="switch-cap-mesh"
              x={-W / 2 + 4}
              y={-H / 2 + 4}
              width={W - 8}
              height={H - 8}
              rx={4}
            />
          </>
        ) : (
          /* Moulded plastic cap with a bevelled shoulder, below its lamp. */
          <>
            <path
              className="switch-cap-bevel"
              d={`M ${-W / 2 + 3} ${-H / 2 + 22} L ${W / 2 - 3} ${-H / 2 + 22} L ${W / 2 - 6} ${H / 2 - 4} L ${-W / 2 + 6} ${H / 2 - 4} Z`}
            />
            <rect
              className="switch-cap-face"
              x={-W / 2 + 6.5}
              y={-H / 2 + 25}
              width={W - 13}
              height={H / 2 - 3}
              rx={1.5}
            />
          </>
        )}
      </g>

      <rect
        className="switch-hit"
        x={-W / 2 - 2}
        y={-H / 2 - 2}
        width={W + 4}
        height={H + 4}
        onPointerDown={(e) => {
          e.preventDefault()
          advance()
        }}
      />

      {label.length > 0 &&
        !spec.labelAbove &&
        label.map((line, i) => (
          <text key={i} className="switch-label" y={H / 2 + 19 + i * 17} textAnchor="middle">
            {line}
          </text>
        ))}

      <title>{name}</title>
    </g>
  )
}
