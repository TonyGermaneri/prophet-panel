/**
 * Shared SVG paint. Every material on the panel — walnut, the cream faceplate, knob caps, LEDs —
 * is defined once here and referenced by id, so the whole instrument can be re-tinted from one
 * place and the browser only rasterises each gradient once.
 */
export function Defs() {
  return (
    <defs>
      {/* Walnut: warm browns crossed with a turbulence grain. */}
      <linearGradient id="walnut" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a9743f" />
        <stop offset="35%" stopColor="#8d5a2d" />
        <stop offset="70%" stopColor="#7a4a24" />
        <stop offset="100%" stopColor="#653a1b" />
      </linearGradient>
      <filter id="woodGrain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9 0.014" numOctaves="4" seed="7" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.22" intercept="0" />
        </feComponentTransfer>
        <feComposite in2="SourceGraphic" operator="atop" />
      </filter>

      {/*
        Faceplate: the Rev4 panel is black with white legends, so this is a near-black with a
        faint top-down fall-off rather than the white of the printed patch sheet.
        User-space units, not the default bounding-box units, so that the small rectangles which
        clear the section rules for their legends pick up exactly the same gradient stop as the
        plate behind them — otherwise each legend sits in a visible lighter patch.
      */}
      <linearGradient id="plate" gradientUnits="userSpaceOnUse" x1="0" y1="74" x2="0" y2="559">
        <stop offset="0%" stopColor="#26262a" />
        <stop offset="45%" stopColor="#1a1a1d" />
        <stop offset="100%" stopColor="#101012" />
      </linearGradient>
      <filter id="plateTexture" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="3" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          {/* Grey noise reads far stronger over a black plate than it did over a white one. */}
          <feFuncA type="linear" slope="0.03" />
        </feComponentTransfer>
        <feComposite in2="SourceGraphic" operator="atop" />
      </filter>

      {/* Knob cap: dark moulded plastic lit from upper left, in a knurled skirt. */}
      <radialGradient id="knobFace" cx="36%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#4e4e52" />
        <stop offset="55%" stopColor="#2c2c30" />
        <stop offset="100%" stopColor="#141416" />
      </radialGradient>
      <linearGradient id="knobSkirt" x1="0.25" y1="0" x2="0.75" y2="1">
        <stop offset="0%" stopColor="#3a3a3e" />
        <stop offset="50%" stopColor="#1c1c1f" />
        <stop offset="100%" stopColor="#0a0a0b" />
      </linearGradient>
      <linearGradient id="knobSheen" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
        <stop offset="45%" stopColor="#ffffff" stopOpacity="0.03" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
      </linearGradient>

      {/* Switch cap: moulded plastic with a bevelled shoulder. */}
      <linearGradient id="capFace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#55555a" />
        <stop offset="55%" stopColor="#35353a" />
        <stop offset="100%" stopColor="#1d1d20" />
      </linearGradient>
      <linearGradient id="capBevel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3d3d42" />
        <stop offset="100%" stopColor="#232326" />
      </linearGradient>
      <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#050505" />
        <stop offset="45%" stopColor="#121214" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>

      {/* LED: dark red when idle, saturated with a bloom when lit. */}
      <radialGradient id="ledOff" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#7d2b28" />
        <stop offset="100%" stopColor="#3a1210" />
      </radialGradient>
      <radialGradient id="ledOn" cx="35%" cy="30%" r="85%">
        <stop offset="0%" stopColor="#fff0e6" />
        <stop offset="30%" stopColor="#ff6b4a" />
        <stop offset="100%" stopColor="#c81f10" />
      </radialGradient>
      <radialGradient id="ledBloom" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ff5b38" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#ff5b38" stopOpacity="0" />
      </radialGradient>

      {/* Programmer readout. */}
      <linearGradient id="displayGlass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1b1512" />
        <stop offset="100%" stopColor="#0a0807" />
      </linearGradient>

      {/* Nameplate: brushed aluminium. */}
      <linearGradient id="nameplate" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e9e9e6" />
        <stop offset="40%" stopColor="#c8c8c3" />
        <stop offset="55%" stopColor="#dedeD9" />
        <stop offset="100%" stopColor="#a9a9a3" />
      </linearGradient>

      {/* Keys. */}
      <linearGradient id="whiteKey" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f7f6f2" />
        <stop offset="80%" stopColor="#eeece5" />
        <stop offset="100%" stopColor="#d8d5cc" />
      </linearGradient>
      <linearGradient id="blackKey" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a3a38" />
        <stop offset="70%" stopColor="#191918" />
        <stop offset="100%" stopColor="#0a0a09" />
      </linearGradient>

      <filter id="plateDrop" x="-5%" y="-15%" width="110%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#000" floodOpacity="0.45" />
      </filter>
      <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000" floodOpacity="0.5" />
      </filter>
    </defs>
  )
}
