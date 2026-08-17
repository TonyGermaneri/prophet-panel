import { useCallback, useRef } from 'react'

import { BY_ID } from '../domain/parameters'
import { useParam } from '../state/hooks'
import { controlRange } from '../state/store'
import { useBindings } from '../ui/useBindings'
import { accessibleName, type KnobLayout } from './layout'
import { useMetrics } from './metrics'

/** Pointer travel, as a fraction of the panel's width, for a full sweep of the control. */
const DRAG_RANGE = 260

const FINE_FACTOR = 0.2

function angleFor(value: number, min: number, max: number, sweep: number): number {
  const t = max === min ? 0 : (value - min) / (max - min)
  return -sweep / 2 + t * sweep
}

function polar(angleDeg: number, r: number): [number, number] {
  // 0deg points straight up, angles increase clockwise, matching the printed scales.
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [Math.cos(rad) * r, Math.sin(rad) * r]
}

function tickLabels(spec: KnobLayout): string[] {
  if (spec.ticks) return spec.ticks
  if (spec.scale === 'bipolar') return ['5', '4', '3', '2', '1', '0', '1', '2', '3', '4', '5']
  return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
}

export function Knob({ spec }: { spec: KnobLayout }) {
  const [value, setValue] = useParam(spec.param)
  const { min, max } = controlRange(spec.param)
  const drag = useRef<{ y: number; value: number } | null>(null)
  const bind = useBindings()
  const { knob } = useMetrics()
  const { radius: R, tickInner, tickOuter, numberRadius, sweep, labelOffset } = knob
  /** The outermost scale numbers sit at ±135°, so both coordinates are r/√2. */
  const EXTREME_TICK = numberRadius * Math.SQRT1_2

  const commit = useCallback(
    (next: number) => {
      // Bind mode is for selecting controls, not moving them — including via wheel and keys.
      if (bind.active) return
      if (spec.detents) {
        const step = (max - min) / (spec.detents - 1)
        next = min + Math.round((next - min) / step) * step
      }
      setValue(next)
    },
    [setValue, spec.detents, min, max, bind.active],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    // In bind mode a click selects the control to be learned rather than operating it.
    if (bind.active) {
      bind.select(bind.selected === spec.param ? null : spec.param)
      return
    }
    // Capture keeps events coming if the pointer leaves the knob mid-drag, but it is an
    // optimisation, not a requirement — and it throws for a pointer the browser does not know
    // about. Letting that propagate would abandon the drag before it had even started.
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {
      /* drag still works, it just ends if the pointer leaves the element */
    }
    drag.current = { y: e.clientY, value }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    // clientY is in CSS pixels; scale by the rendered height of the SVG so a drag feels the same
    // regardless of how large the panel is on screen.
    const svg = (e.target as SVGElement).ownerSVGElement
    const scale = svg ? svg.clientHeight / svg.viewBox.baseVal.height || 1 : 1
    const travel = (d.y - e.clientY) / scale
    const factor = e.shiftKey ? FINE_FACTOR : 1
    commit(d.value + (travel / DRAG_RANGE) * (max - min) * factor)
  }

  const endDrag = () => {
    drag.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    const step = (max - min) / (e.shiftKey ? 200 : 40)
    commit(value - Math.sign(e.deltaY) * step)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : Math.max(1, Math.round((max - min) / 40))
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') commit(value + step)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') commit(value - step)
    else if (e.key === 'Home') commit(min)
    else if (e.key === 'End') commit(max)
    else return
    e.preventDefault()
  }

  const angle = angleFor(value, min, max, sweep)
  const labels = tickLabels(spec)
  const name = accessibleName(BY_ID.get(spec.param)?.section, spec.label)

  return (
    <g
      className={[
        'knob',
        spec.chrome ? 'chrome' : '',
        bind.active ? 'bindable' : '',
        bind.selected === spec.param ? 'bind-selected' : '',
        bind.active && bind.bindingFor(spec.param) ? 'bound' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${spec.x},${spec.y})`}
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
    >
      {/* Printed scale — static, drawn under the cap. */}
      <g className="knob-scale">
        {labels.map((text, i) => {
          const a = -sweep / 2 + (i / (labels.length - 1)) * sweep
          const [x1, y1] = polar(a, tickInner)
          const [x2, y2] = polar(a, tickOuter)
          const [tx, ty] = polar(a, numberRadius)
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} />
              <text x={tx} y={ty} dy="0.36em">
                {text}
              </text>
            </g>
          )
        })}
      </g>

      {bind.active && <circle className="bind-ring" r={R + 7} />}

      <ellipse className="knob-shadow" cx={1.5} cy={4} rx={R * 1.02} ry={R * 0.98} />

      {/* Chrome bezel. Static, because a bezel is part of the panel, not part of the cap. */}
      <circle className="knob-rim" r={R} />

      {/* The cap itself rotates; the knurling turns with it, which is most of the read. */}
      <g transform={`rotate(${angle})`}>
        <circle className="knob-skirt" r={R - 2.6} />
        <g className="knob-knurl">
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * 360
            const [x1, y1] = polar(a, R - 6)
            const [x2, y2] = polar(a, R - 3.2)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          })}
        </g>
        <circle className="knob-face" r={R - 6.2} />
        <circle className="knob-sheen" r={R - 6.2} />
        <rect
          className="knob-pointer"
          x={-1.9}
          y={-(R - 5.6)}
          width={3.8}
          height={R * 0.58}
          rx={1.6}
        />
      </g>

      {/* Hit target sits on top so the pointer never lands on a child element mid-drag. */}
      <circle
        className="knob-hit"
        r={R + 2}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => commit(spec.scale === 'bipolar' ? (min + max) / 2 : min)}
      />

      {/*
        Scale-end legends (WHEEL-MOD's LFO/NOISE) hang off the outermost scale numbers. They are
        placed from the same polar geometry as those numbers and anchored inward, so they sit hard
        against the "5" on each side and stay inside the section frame instead of overhanging it.
      */}
      {spec.endLabels && (
        <>
          <text
            className="knob-end-label"
            textAnchor="end"
            x={-(EXTREME_TICK + 5)}
            y={EXTREME_TICK}
            dy="0.36em"
          >
            {spec.endLabels[0]}
          </text>
          <text
            className="knob-end-label"
            textAnchor="start"
            x={EXTREME_TICK + 5}
            y={EXTREME_TICK}
            dy="0.36em"
          >
            {spec.endLabels[1]}
          </text>
        </>
      )}

      <text
        className="knob-label"
        x={spec.labelDx ?? 0}
        y={(spec.labelDy ?? 0) + (spec.labelDx ? 0 : labelOffset)}
        textAnchor={spec.labelDx ? 'start' : 'middle'}
      >
        {spec.label}
      </text>

      <title>{`${name}: ${value}`}</title>
    </g>
  )
}
