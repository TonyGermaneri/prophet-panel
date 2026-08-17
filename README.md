# prophet-panel

A browser control surface for the Sequential Prophet-10 (Rev4). It renders the front panel,
drives the instrument live over MIDI, and loads, saves, sends and syncs patches.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # codec round-trip over the factory corpus
```

Web MIDI with sysex needs Chrome or Edge and a secure context. `localhost` counts as secure, so
the dev server works without TLS.

## What's here

- **Panel** — every knob and switch of the Rev4 faceplate, drawn as SVG. Drag a knob (shift for
  fine, double-click to reset, arrow keys when focused); click a cap to advance it.
- **Library** — patches in IndexedDB, seeded on first run with the 120 Rev3.3 factory sounds.
  Import and export `.syx`, save the current panel state, send a patch to the synth, or pull
  programs off the instrument.
- **MIDI** — panel edits stream out as NRPN; hardware knob moves come back and move the on-screen
  control. Sysex handles whole-patch transfer.

To drive the synth, set **Param Xmit** and **Param Rcv** to **NRPN** in its globals. Without that
the panel looks connected but nothing moves.

## Troubleshooting

Open **Monitor** in the toolbar to see MIDI traffic in both directions with decoded bytes. It also
reports what it can infer from what has arrived.

**Knobs work but patch transfer doesn't.** The Prophet has a `MIDI SysEx` global that is separate
from `MIDI Out`, so parameter messages and sysex travel independently. Over a 5-pin DIN connection
(e.g. through an audio interface's MIDI ports) it must be set to `MIDI`; set it to `USB` only when
the synth is plugged in by USB cable. Reach it with `GLOBALS`, then program button **6**, then the
`GROUP SELECT` / `BANK SELECT` buttons to change the value.

**Selecting a patch on the synth.** The instrument sends a program change, not a dump. The panel
follows the slot and then requests the new edit buffer — which needs sysex working in both
directions.

## Sysex format notes

The official [Prophet-5 MIDI Implementation
1.4](https://sequential.com/wp-content/uploads/2021/03/Prophet-5-MIDI-Implementation-1.4.pdf) is
the starting point, but several details in it are wrong or incomplete. What follows was verified by
decoding all 123 files in `patches/factory/`; `npm test` re-checks every claim below.

**Program dump layout.** `F0 01 <device> 02 <group 0-9> <program 0-39> <152 packed bytes> F7`. The
payload is packed MS-bit: 8-byte packets whose first byte carries the stripped high bits of the
next seven. 152 packed bytes unpack to 133, of which the doc describes 128.

**NRPN number is not always the byte offset.** The doc says the program bytes "follow the order of
the NRPN list". That holds for NRPN 0–54 only. Bytes 55–64 are unison note assignments and 65–84
are the 20-character program name — which the doc lists as `RESERVED`. Treating NRPN as an offset
would write layer select (NRPN 80) into the middle of the name. `src/domain/parameters.ts` keeps
`nrpn` and `offset` as separate fields for this reason.

**Bytes 85–96 are unverified.** They hold identical values in all 120 factory patches, so the
corpus proves nothing about them. Parameters that plausibly live there — pitch wheel range,
retrigger, and the Prophet-10 bi-timbral layer settings — are marked control-only: they can be
driven live over MIDI but are never written into a program. The bytes pass through edits untouched.

**Device ID must be discovered, not assumed.** The doc says `0x31` in its sysex tables and `0x33`
in the device-inquiry reply, while every factory file uses `0x32`. The app sends a Universal Device
Inquiry, uses whatever ID the instrument reports, and accepts all three on receive — which is also
what lets these P5-authored files load into a Prophet-10.

**Values can exceed the documented range.** One factory patch has an amp sustain of 121 against a
documented maximum of 120. The panel clamps on write but never rewrites bytes it did not edit, so
loading and re-saving a patch is byte-identical.

## Layout

```
src/domain/      parameter table, sysex codec, patch model  (no browser APIs, fully tested)
src/panel/       SVG faceplate: layout data + Knob/Switch/Keyboard
src/midi/        Web MIDI transport, NRPN codec, store<->synth sync
src/library/     IndexedDB store and the librarian UI
src/state/       patch store and React bindings
patches/factory/ the 120 Rev3.3 factory patches plus 3 bank files
public/reference/panel.jpg   the patch sheet the panel geometry is derived from
```

Panel geometry is not hand-placed. Knob centres came from Hough circle detection over the reference
patch sheet (it finds exactly the instrument's 28 knobs), and switch bezels and section frames from
contour detection, so `src/panel/layout.ts` stays in the sheet's own coordinate space and can be
re-derived from it.

## Still to confirm on hardware

- Whether NRPN 39 is aftertouch→amp (as the doc says) or aftertouch→LFO (as the panel is printed).
- The device ID a Prophet-10 actually reports.
- The meaning of program bytes 85–96, which would let the bi-timbral layer settings be stored.
