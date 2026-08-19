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
npm run dev      # http://localhost:5173
npm test         # codec round-trip over the factory corpus
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
- **Input device** — pick a controller under the gear icon. Its notes, control changes, pitch bend
  and aftertouch are passed through to the Prophet on the synth's own channel, so you can play and
  automate the instrument through the app. The synth's own port is excluded from the list, since
  routing its keyboard back to it would loop.
- **MIDI Bind** — drive the panel (and therefore the synth) from that controller. Click
  **MIDI Bind**, click a knob or switch to select it, then move a control on your controller to
  bind the two. Bindings take precedence over pass-through: a bound message drives its panel
  control instead of reaching the synth twice. Bindings are listed on the right, can be removed
  individually or cleared, and persist.
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
- The device ID a Prophet-10 actually reports.
- The meaning of program bytes 85–96, which would let the bi-timbral layer settings be stored.
