The macOS builds are signed with a Developer ID certificate, notarised by Apple and stapled — so
they open with no warning and no right-click dance, including on a machine with no network.

**Install**

| | |
| --- | --- |
| `Prophet Panel.component` | `/Library/Audio/Plug-Ins/Components` |
| `Prophet Panel.vst3` | `/Library/Audio/Plug-Ins/VST3` |
| `Prophet Panel.app` | anywhere; `/Applications` is the usual place |

`/Library` installs for every user and needs an admin password; `~/Library` installs for you alone
and does not.

**In a DAW**, load it on a MIDI track as an instrument — it generates silence, and drives the synth
over a MIDI port it opens itself, which you choose under the gear icon. The standalone app needs no
host at all and is the only way to run the panel on a Mac outside Chrome, since Safari has no
Web MIDI.
