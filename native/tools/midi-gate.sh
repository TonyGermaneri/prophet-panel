#!/usr/bin/env bash
#
# Run the MIDI output gate against the built standalone.
#
#   native/tools/midi-gate.sh native/build/ProphetPanel_artefacts/Release
#
# Seeds the panel's settings so it opens pointing at the gate's virtual ports, with one control
# bound to a control change, then launches it and lets the gate read what comes out. The settings
# are saved and put back afterwards, because this would otherwise walk over a real setup.

set -euo pipefail

artefacts="${1:-native/build/ProphetPanel_artefacts/Release}"
app="$artefacts/Standalone/Prophet Panel.app"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -d "$app" ] || { echo "no standalone at $app" >&2; exit 2; }

settings_dir="$HOME/Library/Application Support/Prophet Panel"
settings="$settings_dir/Prophet Panel.settings"
standalone_state="$HOME/Library/Application Support/Prophet Panel.settings"
backup="$(mktemp -d)"

mkdir -p "$settings_dir"
[ -f "$settings" ] && cp "$settings" "$backup/app.settings"
[ -f "$standalone_state" ] && cp "$standalone_state" "$backup/standalone.settings"

cleanup() {
    osascript -e 'tell application "Prophet Panel" to quit' >/dev/null 2>&1 || true
    sleep 2
    pkill -f "Prophet Panel.app" 2>/dev/null || true
    if [ -f "$backup/app.settings" ]; then cp "$backup/app.settings" "$settings"; else rm -f "$settings"; fi
    if [ -f "$backup/standalone.settings" ]; then cp "$backup/standalone.settings" "$standalone_state"; else rm -f "$standalone_state"; fi
    rm -rf "$backup"
}
trap cleanup EXIT

pkill -f "Prophet Panel.app" 2>/dev/null || true
sleep 1

# The unique IDs here are the ones midi-gate.swift stamps onto its virtual endpoints, and JUCE
# derives a virtual port's identifier from exactly that — so the binding can name the port before
# either side has run.
python3 - "$settings" <<'PY'
import json, sys
from xml.sax.saxutils import quoteattr

settings = {
    # hasConnected is what makes the panel connect without being asked, which is what makes it
    # send the device inquiry this gate reads.
    "outputId": "770002", "outputName": "Gate Out",
    "channel": 0, "follow": False, "hasConnected": True,
}

values = {"prophet-panel:settings": json.dumps(settings)}
body = "\n".join(f'  <VALUE name={quoteattr(k)} val={quoteattr(v)}/>' for k, v in values.items())
open(sys.argv[1], "w").write(
    f'<?xml version="1.0" encoding="UTF-8"?>\n\n<PROPERTIES>\n{body}\n</PROPERTIES>\n')
PY

# No remembered editor size or patch, so the panel opens clean.
rm -f "$standalone_state"

gate="$(mktemp -d)/midi-gate"
swiftc -O -o "$gate" "$here/midi-gate.swift"

# The ports have to exist before the panel enumerates them.
"$gate" 60 & gate_pid=$!
sleep 2

open "$app"

wait "$gate_pid"
