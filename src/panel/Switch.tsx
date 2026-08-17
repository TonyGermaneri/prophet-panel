import { useState } from 'react'

import { BY_ID } from '../domain/parameters'
import { dispatchAction } from '../state/actions'
import { useParam } from '../state/hooks'
import { controlRange } from '../state/store'
import { useBindings } from '../ui/useBindings'
import { accessibleName, SWITCH, type SwitchIcon, type SwitchLayout } from './layout'

const { h: H } = SWITCH
/** Two-LED caps (VELOCITY, AFTERTOUCH, FILTER REV) sit in a wider bezel on the instrument. */
const widthFor = (leds: number) => (leds > 1 ? 50 : SWITCH.w)

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
  const W = widthFor(leds)

  // Shape switches carry only a waveform glyph, so their accessible name has to come from the
  // parameter table rather than the (absent) printed legend.
  const domain = BY_ID.get(spec.bits?.[0] ?? spec.param)
  const name = domain
    ? accessibleName(domain.section, spec.bits ? spec.label ?? domain.name : domain.name)
    : (spec.label?.replace('\n', ' ') ?? spec.param)

  return (
    <g
      className={[
        'switch',
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
        <text className="switch-label" y={-H / 2 - 10} textAnchor="middle">
          {label[0]}
        </text>
      )}

      {spec.ledLabels && (
        <>
          <text className="switch-led-label" x={-13} y={-H / 2 - 8}>
            {spec.ledLabels[0]}
          </text>
          <text className="switch-led-label" x={13} y={-H / 2 - 8}>
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

      {/* LEDs occupy the upper third of the cap, as on the instrument. */}
      {Array.from({ length: leds }, (_, i) => {
        const cx = leds === 1 ? 0 : (i - (leds - 1) / 2) * 26
        const on = ledLit(mode, i, litValue, range.min)
        return (
          <g key={i} className={on ? 'led on' : 'led'}>
            {on && <circle className="led-bloom" cx={cx} cy={-H / 2 + 13} r={9} />}
            <circle className="led-body" cx={cx} cy={-H / 2 + 13} r={5.2} />
            <circle className="led-gloss" cx={cx - 1.4} cy={-H / 2 + 11.4} r={1.7} />
          </g>
        )
      })}

      {/* Moulded cap, drawn with its bevel; it sinks slightly while pressed. */}
      <g className={flash ? 'switch-cap pressed' : 'switch-cap'}>
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
