# prophet-panel

**<https://tonygermaneri.github.io/prophet-panel/>**

A browser control surface for the Sequential Prophet-5 and Prophet-10 (Rev4). It renders the front
panel, drives the instrument live over MIDI, and loads, saves, sends and syncs patches.

The two are the same synthesizer twice — same faceplate, same parameters, same sysex — differing in
voice count, which a control surface cannot observe, and in the number on the logo, which it can.
Click the logo (or use **Instrument** under the gear icon) to switch between them; it changes the
badge, the window title and the names on exported files, and nothing else. Prophet-10 is the
default.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # codec round-trip over the factory corpus
npm run build:native # the AU / VST3 / standalone build — see In a DAW
```

Web MIDI with sysex needs Chrome or Edge and a secure context. `localhost` counts as secure, so
the dev server works without TLS.

## What's here

- **Panel** — every knob and switch of the Rev4 faceplate, drawn as SVG, badged as either
  instrument. Drag a knob (shift for
  fine, double-click to reset, arrow keys when focused); click a cap to advance it.
- **Library** — patches in IndexedDB, seeded on first run with all 400 programs from the
  instrument's own memory. Shown above the panel, five columns per group so each column is one of
  the instrument's banks, numbered exactly as the synth numbers them. The **Programs** tab is that
  memory — the factory set plus anything pulled off the synth via **Receive dump**, addressed by
  slot. Export `.syx`, send a patch to the synth, or step the library with the `−`/`+` buttons
  beside the patch number — those walk the library rather than the instrument's own program memory,
  and follow the search filter when one is active, so stepping stays inside what the panel is
  showing.
- **MIDI** — panel edits stream out as NRPN; hardware knob moves come back and move the on-screen
  control. Sysex handles whole-patch transfer. Port choices are remembered between sessions.
- **Play from the computer keyboard** — `A`–`K` for white keys, `W`–`U` for sharps, `Z`/`X` to
  shift octave and `C`/`V` velocity. The keyboard toggle switches between the keyboard instrument
  and the **desktop module** — the same synth in different furniture, with its own arrangement,
  illuminated caps and printed logo, drawn from its own reference photo.
- **Input device** — pick a controller under the gear icon. Its notes, pitch bend, aftertouch and
  performance controllers — the wheels, expression, the pedals, volume — are passed through to the
  Prophet on the synth's own channel, so you can play the instrument through the app. The synth's
  own port is excluded from the list, since routing its keyboard back to it would loop.
  A control change the Prophet reads as a *parameter* is not passed through: fifty-seven CC numbers
  are wired to parameters on this synth, so relaying an unbound knob would silently rewrite the
  patch. Bind a knob to drive a parameter.
- **MIDI Bind** — drive the panel (and therefore the synth) from that controller. Click
  **MIDI Bind**, click a knob or switch to select it, then move a control on your controller to
  bind the two. Bindings take precedence over pass-through: a bound message drives its panel
  control instead of reaching the synth twice. Bindings are listed on the right, can be removed
  individually or cleared, and persist. Control changes, notes, pitch bend, aftertouch and **NRPN**
  can all be bound, so a synth used as a controller — a Peak, anything that addresses its controls
  by parameter number — is bindable too. An NRPN value is taken at face value rather than scaled
  from 0-127, so a four-state button selects state four here.
- **Your own patches** — the **User** tab files patches into groups you name, rather than into the
  instrument's 400 slots. Everything you save or import lands there. Save the panel's current sound
  into a group or drop in any `.syx` files, give each patch an author, a description and tags, and
  export the whole group as a zip. Described under [Your own groups](#your-own-groups).
- **Sharing** — subscribe to a patch library published in a Git repository, or pass one around as
  a zip. Both are described under [Sharing patches](#sharing-patches).
- **Installable and offline** — it's a PWA. Install it from the browser's address bar to get a
  standalone window with no URL to navigate to, and the whole app plus the factory banks are
  precached, so it opens and runs with no network at all. MIDI still needs the hardware, of course.

To drive the synth, set **Param Xmit** and **Param Rcv** to **NRPN** in its globals. Without that
the panel looks connected but nothing moves.

## Sharing patches

Two routes, one format. A shared library is a directory holding a `manifest.json` and the `.syx`
files it names; a zip bundle is that same directory in a file. A bundle can therefore be unpacked
into a repository and published as-is, and a published directory can be zipped and mailed to
someone who would rather not subscribe to anything.

Under the gear icon, **Libraries** manages both.

### Subscribing to a repository

Paste any of these — a GitHub browse URL, a link to the manifest itself, a raw URL, or `owner/repo`
shorthand — and each collection in the manifest appears as its own tab in the library:

```
https://github.com/TonyGermaneri/prophet-panel/tree/main/patches/factory
```

That one is this repository's own factory set: the Prophet-10's 400 programs, split into the two
halves the instrument addresses them by. Nothing is GitHub-specific beyond the URL forms — any web
server that serves the directory with permissive CORS works.

Manifests are re-read on every load rather than cached, so a repository that gains a collection
shows it without anyone refreshing anything. Shared patches live only in memory: they belong to
whoever published them, so they stay out of your library and out of the export scopes until you
copy one across with the **+** that appears on hover. Selecting a shared patch sends it to the
synth's edit buffer and nothing else — **nothing shared can overwrite a program on the
instrument.**

### Publishing one

Drop `.syx` files in a directory alongside a `manifest.json`, and push:

```json
{
  "version": 1,
  "name": "My Prophet Patches",
  "description": "Optional, shown beside the source",
  "author": "Optional",
  "createdAt": "2026-08-19T00:00:00.000Z",
  "collections": [
    {
      "id": "pads",
      "name": "Pads",
      "description": "Optional, shown as the tab's tooltip",
      "author": "Optional, overrides the bundle's",
      "files": ["Warm Pads.syx", "Cold Pads.syx"],
      "patches": [
        {
          "index": 0,
          "name": "GLASS HOUSE",
          "author": "Optional",
          "description": "Bell-like, long release",
          "tags": ["pad", "bright"],
          "createdAt": "2026-07-04T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

Each collection becomes one tab. A file may be a single program or a whole bank — a bank file is
just program-data messages concatenated, which is what the instrument's own dump produces.

Everything but `version`, `name`, and each collection's `name` and `files` is optional. `patches`
is where authorship lives: a program has twenty characters of upper case for its name and nowhere
at all for a byline, so anything more than that is said here, beside the files, where it stays
readable and diffable in the repository. `index` counts programs across the collection's files in
the order `files` lists them, so a collection of two forty-program banks is indexed 0–79. Entries
that are malformed are dropped without costing the programs they describe.

A manifest is content from someone else's repository, so `files` entries are validated as relative
paths within the source directory: absolute paths, `..` segments, and anything naming another host
are rejected rather than fetched.

### Zip bundles

**Export** writes a bundle with one `.syx` and one collection per bank or group, plus the manifest.
**Import** adds a tab of its own named after the file, holding the bundle's groups. It accepts a
plain folder of `.syx` files someone zipped up with no manifest at all — the filenames become the
group names — and archives written by other tools are read whether stored or deflated.

Importing the same filename again **replaces** what the previous import left rather than stacking a
second tab beside it, so keeping up with a bundle that is being published is a matter of exporting,
committing, and re-importing.

## Your own groups

The **User** tab holds patches filed by name rather than by slot. **Programs** is the instrument's
memory — ten groups of forty — which is the wrong shape for sounds still being worked on: they
arrive as arbitrary files, come from anywhere, and want to be filed by what they are. A group is
that filing.

**Save current** and **Import .syx** under the gear icon both file into a group, chosen there; the
first save makes one called *My Patches* if none exists yet. **Receive dump** is the exception and
goes to Programs, because every program in a dump carries the slot it came from — and so does a
shared patch copied across with **+**.

**New group** names one and records who made it and what it is for. On each group:

- **+ Panel** files the sound currently on the panel, byte for byte.
- **+ Files** takes any `.syx` files — one program or a whole bank each.
- **Export** writes the group out as a zip, in the same format a shared repository holds, so an
  exported group can be unpacked into a repo and published without conversion.
- **Edit** and **Delete** change the group's details or remove it and its patches together.

The **i** beside a patch opens its details: name, author, description, tags, and which group it is
in. The name is the instrument's own twenty characters and travels inside the patch; the rest
travels beside it, in the manifest of any bundle the group is exported into — and comes back when
that bundle is imported, or when a subscribed repository publishes one.

Patches in a group are listed in the order they were added, which is the order a bundle writes them
in, which is what keeps the per-patch details attached to the right sounds across a round trip.

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

**Getting the instrument's own patches.** The Prophet answers no sysex *request* — verified against
the hardware on every one of the 128 device IDs, properly spaced — so its memory cannot be pulled.
It does dump on demand from its own front panel, so press **Receive dump** in the library, then
`GLOBALS` → program button **7** (*Pgm Dump*) on the synth. Incoming programs are filed by the
group and program they carry, and the panel is left alone while receiving.

**Knobs reach the synth but selecting a patch does nothing.** Two causes, both reported in the
control panel. Either sysex was not permitted for the site — NRPN carries no permission
requirement, so parameter control keeps working while every patch transfer fails — or the
instrument has not identified itself yet, so its device ID is unknown. Every device-addressed
message is sent to all three IDs in the family until one is confirmed, so this should self-correct;
pressing Identify settles it immediately.

## Installing

Open the site and use the browser's install control (an icon in the address bar in Chrome, or
*File → Install…*). The service worker precaches the app shell and the factory banks, so it starts
and runs offline.

The worker is only registered in production builds — in front of the dev server it would serve
stale modules and fight hot reload.

## In a DAW

The panel also builds as an **AU**, a **VST3** and a standalone app, so it can sit in a session
beside the tracks it is playing. It is not a port: it is the same React panel and the same
sysex codec, running in a WebView, with the browser's MIDI, storage and file dialogs swapped for
the host's.

```bash
npm run build:native
```

That builds the web bundle, fetches JUCE, and compiles. Artefacts land in
`native/build/ProphetPanel_artefacts/Release/`, and the AU and VST3 are copied into your user plug-in
folders on the way. Run the standalone first — it is the quickest way to see the panel working
without a DAW in the way, and it is the only way to get the panel on a Mac at all outside Chrome,
since Safari has no Web MIDI.

Or take a build from [Releases](https://github.com/TonyGermaneri/prophet-panel/releases) — every
version tag builds and publishes the AU, the VST3 and the standalone app. They are unsigned, so the
first launch needs `xattr -dr com.apple.quarantine` on the bundle, or a right-click → Open.

It has no audio engine and never will, and it nonetheless declares itself an **instrument**. That
is a lie, and it is the only thing that works: hosts deliver MIDI to instruments and not to effects.
In Ableton Live a VST or AU *effect* on a track receives no MIDI at all, and a plugin that declares
`IS_MIDI_EFFECT` makes Live refuse to load it outright. So it is an instrument that generates
silence — macOS reports it as `aumu`. Put it on a MIDI track; the sound comes from the hardware.

**It opens the Prophet's port itself**, exactly as the browser does, and this is not a preference
either. Ableton Live never passes sysex to a plugin — [SysEx reaches Max for Live devices and
nothing else](https://help.ableton.com/hc/en-us/articles/360003148640-SysEx-support) — so a patch
dump routed through the host would simply never arrive, and the librarian would be decorative.
Driving the instrument over its own port is also how the established editors for this hardware work.
Choose the port under the gear icon, the same way you would in the browser.

The host is not ignored: its MIDI stream appears as one more input port named **DAW / Host**, so a
track can play the Prophet through the panel's existing controller pass-through. Pick it under the
gear icon as the input device. Notes and controllers arrive that way; sysex does not, which is why
patch transfer uses the direct port.

### Setting it up in Ableton Live

1. Make a **MIDI track** and drop **Prophet Panel** on it as an instrument. The track stays silent.
2. Open the panel, and under the gear icon set **Synth in** and **Synth out** to the interface the
   Prophet is on.
3. To play it from the track, set **Input Device** to **DAW / Host**.
4. For audio, bring the Prophet's outputs back on a separate audio track, or use Live's
   **External Instrument** device.

**Settings and patches are kept natively**, in `~/Library/Application Support/Prophet Panel/`,
rather than in the WebView. A WebView served from a custom scheme has no origin the browser will
reliably grant durable storage to, so a library left in IndexedDB would be one host cache clear
away from empty. Keeping it on disk also means every DAW on the machine sees the same library.

The panel's current sound is written into the host's session, so reopening a project brings the
patch back with it.

Not yet wired up, and browser-only for now: importing `.syx` and zip files, and subscribing to
shared repositories. Note also that MIDI only flows while the panel is open — closing the window
destroys the WebView, and the forwarding rules live inside it.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`:
<https://tonygermaneri.github.io/prophet-panel/>

The workflow runs the test suite before building, so a broken sysex decode fails the deploy rather
than shipping. One manual step is needed once, in the repository's **Settings → Pages**: set
**Source** to **GitHub Actions**.

Because Pages serves a project site from `/<repo>/`, builds carry that base path while the dev
server stays at the root — see `PAGES_BASE` in `vite.config.ts`. Pages also has no server-side
rewrite, so the build writes `404.html` alongside `index.html` and any path lands on the app.

Note that the deployed site can render and edit patches but cannot reach a synth unless the browser
supports Web MIDI: Chrome and Edge do, Safari and Firefox do not.

## Sysex format notes

The official [Prophet-5 MIDI Implementation
1.4](https://sequential.com/wp-content/uploads/2021/03/Prophet-5-MIDI-Implementation-1.4.pdf) is
the starting point, but several details in it are wrong or incomplete. What follows was verified by
decoding the instrument's own 400-program dump in `patches/factory/`; `npm test` re-checks every
claim below.

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
src/panel/       SVG faceplates: layout data per variant + Knob/Switch/Keyboard
src/midi/        Web MIDI transport, NRPN codec, store<->synth sync
src/library/     IndexedDB store and the librarian UI
src/state/       patch store and React bindings
patches/factory/ the instrument's own 400 programs, one .syx per group
reference/           the patch sheet and photo the two layouts are derived from
```

Panel geometry is not hand-placed. Knob centres came from Hough circle detection over the reference
patch sheet (it finds exactly the instrument's 28 knobs), and switch bezels and section frames from
contour detection, so `src/panel/layout.ts` stays in the sheet's own coordinate space and can be
re-derived from it.

## Still to confirm on hardware

- Whether NRPN 39 is aftertouch→amp (as the doc says) or aftertouch→LFO (as the panel is printed).
- The meaning of program bytes 85–96, which would let the bi-timbral layer settings be stored.

**Settled: the device ID.** A Prophet-10 Rev4 (firmware 2.1) answers a universal device inquiry
with family ID **0x33**, and then accepts and answers Sequential sysex only on device ID **0x32** —
the value the factory files carry, and the one `DEFAULT_DEVICE_ID` already used. The two fields
genuinely disagree on real hardware, which is exactly why `sendAddressed` fans a device-addressed
message out to every ID in the family until the instrument has answered on one. Locking onto the
inquiry's family ID instead would leave every patch transfer silently ignored while NRPN kept
working and hid the problem.

Measured directly: `F0 7E 7F 06 01 F7` returns `F0 7E 7F 06 02 01 33 01 00 00 02 01 00 F7`, while
of `F0 01 31 06 F7` / `F0 01 32 06 F7` / `F0 01 33 06 F7` only the **0x32** request produces an edit
buffer dump.
