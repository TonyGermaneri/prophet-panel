**These builds are unsigned.** macOS will refuse to open them until you either open one from the
right-click menu once, or clear the quarantine flag yourself:

```
xattr -dr com.apple.quarantine "Prophet Panel.component"
```

**Install**

| | |
| --- | --- |
| `Prophet Panel.component` | `/Library/Audio/Plug-Ins/Components` |
| `Prophet Panel.vst3` | `/Library/Audio/Plug-Ins/VST3` |
| `Prophet Panel.app` | anywhere; `/Applications` is the usual place |

**In a DAW**, load it on a MIDI track as an instrument — it generates silence, and drives the synth
over a MIDI port it opens itself, which you choose under the gear icon.
