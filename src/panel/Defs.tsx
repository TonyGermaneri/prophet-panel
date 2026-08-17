/**
 * Shared SVG paint. Every material on the panel — walnut, the cream faceplate, knob caps, LEDs —
 * is defined once here and referenced by id, so the whole instrument can be re-tinted from one
 * place and the browser only rasterises each gradient once.
 */
export function Defs() {
  return (
    <defs>
      {/*
        Walnut: a #946651 base carrying two grain colours. Each grain layer floods its own colour
        and uses stretched turbulence as its alpha, so the streaks are genuinely that colour rather
        than a grey noise tint that would wash the base toward neutral.
      */}
      <linearGradient id="walnut" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#9e7059" />
        <stop offset="40%" stopColor="#946651" />
        <stop offset="100%" stopColor="#835747" />
      </linearGradient>

      <filter id="grainA" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.75 0.011" numOctaves="4" seed="11" />
        {/* Take the noise's red channel as alpha; the offset thins the streaks out. */}
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 -0.34"
          result="mask"
        />
        <feFlood floodColor="#7d564c" result="ink" />
        <feComposite in="ink" in2="mask" operator="in" />
      </filter>

      <filter id="grainB" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.6 0.02" numOctaves="3" seed="29" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 -0.42"
          result="mask"
        />
        <feFlood floodColor="#814e3d" result="ink" />
        <feComposite in="ink" in2="mask" operator="in" />
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

      {/*
        Chrome. SVG has no conic gradient, so the turned-metal look comes from a linear gradient
        with alternating highlights and shadows across the diagonal.
      */}
      <linearGradient id="chromeRim" x1="0.12" y1="0" x2="0.88" y2="1">
        <stop offset="0%" stopColor="#fdfdfe" />
        <stop offset="16%" stopColor="#9ea5ac" />
        <stop offset="32%" stopColor="#f3f5f7" />
        <stop offset="50%" stopColor="#63696f" />
        <stop offset="68%" stopColor="#e2e6ea" />
        <stop offset="85%" stopColor="#848a91" />
        <stop offset="100%" stopColor="#f0f2f4" />
      </linearGradient>
      <linearGradient id="chromeFace" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="20%" stopColor="#c6ccd2" />
        <stop offset="38%" stopColor="#fbfcfd" />
        <stop offset="56%" stopColor="#787f86" />
        <stop offset="74%" stopColor="#e8ebee" />
        <stop offset="100%" stopColor="#969da4" />
      </linearGradient>

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
