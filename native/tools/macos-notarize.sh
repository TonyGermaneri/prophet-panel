#!/usr/bin/env bash
#
# Notarise the signed bundles, staple the tickets, and prove it worked.
#
# Notarisation authenticates one of two ways, and which one you use depends on what Apple gave you
# rather than on preference:
#
#   App Store Connect API key   NOTARY_KEY_P8 / NOTARY_KEY_ID / NOTARY_ISSUER_ID
#     A .p8 downloaded once from App Store Connect. Preferred in CI: scoped to notarisation,
#     revocable on its own, and not tied to a person's Apple ID.
#
#   Apple ID + app-specific password   NOTARY_APPLE_ID / NOTARY_PASSWORD / NOTARY_TEAM_ID
#     The fallback, and what you already have if you have a developer account at all. The password
#     is an app-specific one from appleid.apple.com — never the account password.
#
# The API key wins if both are set. Signing (the .p12) and notarising are separate credentials for
# separate steps; having one does not give you the other.
#
#   native/tools/macos-notarize.sh <artefacts-dir> [output-dir]
#
# Written for bash 3.2 — see the note in macos-sign.sh.

set -euo pipefail

artefacts="${1:-}"
outdir="${2:-dist}"

if [ -z "$artefacts" ] || [ ! -d "$artefacts" ]; then
    echo "usage: $0 <artefacts-dir> [output-dir]" >&2
    exit 2
fi

work=""
key_file=""
cleanup() {
    [ -n "$key_file" ] && rm -f "$key_file"
    [ -n "$work" ] && rm -rf "$work"
    return 0
}
trap cleanup EXIT

bundles=()
for candidate in "$artefacts/AU/Prophet Panel.component" \
                 "$artefacts/VST3/Prophet Panel.vst3" \
                 "$artefacts/Standalone/Prophet Panel.app"; do
    [ -e "$candidate" ] && bundles+=("$candidate")
done
if [ "${#bundles[@]}" -eq 0 ]; then
    echo "error: nothing to notarise in $artefacts" >&2
    exit 1
fi

# --------------------------------------------------------------------------------- credentials
notary_args=()
if [ -n "${NOTARY_KEY_PATH:-}" ] && [ -n "${NOTARY_KEY_ID:-}" ] && [ -n "${NOTARY_ISSUER_ID:-}" ]; then
    # A .p8 already on disk: the natural shape for a local run, where the file is simply there and
    # base64-ing it into an environment variable would be ceremony for its own sake.
    [ -r "$NOTARY_KEY_PATH" ] || { echo "error: cannot read $NOTARY_KEY_PATH" >&2; exit 1; }
    notary_args=(--key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID")
    echo "authenticating with App Store Connect API key ${NOTARY_KEY_ID} (from a file)"
elif [ -n "${NOTARY_KEY_P8:-}" ] && [ -n "${NOTARY_KEY_ID:-}" ] && [ -n "${NOTARY_ISSUER_ID:-}" ]; then
    # The CI shape: a GitHub secret holds text, and a .p8 is text only after base64. Decoded to a
    # private temp file rather than passed inline, because notarytool wants a path and a key on the
    # command line is a key in anyone's `ps`.
    key_file="$(mktemp -t notarykey)"
    chmod 600 "$key_file"
    printf '%s' "$NOTARY_KEY_P8" | base64 --decode > "$key_file"
    notary_args=(--key "$key_file" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID")
    echo "authenticating with App Store Connect API key ${NOTARY_KEY_ID}"
elif [ -n "${NOTARY_APPLE_ID:-}" ] && [ -n "${NOTARY_PASSWORD:-}" ] && [ -n "${NOTARY_TEAM_ID:-}" ]; then
    notary_args=(--apple-id "$NOTARY_APPLE_ID" --password "$NOTARY_PASSWORD" --team-id "$NOTARY_TEAM_ID")
    echo "authenticating as ${NOTARY_APPLE_ID} (team ${NOTARY_TEAM_ID})"
else
    cat >&2 <<'MSG'
error: no notarisation credentials.

  Set either
    NOTARY_KEY_PATH     path to the App Store Connect .p8   (local runs)
    NOTARY_KEY_P8       base64 of the same file             (CI, where secrets are text)
    NOTARY_KEY_ID       the key's ID
    NOTARY_ISSUER_ID    the issuer UUID
  or
    NOTARY_APPLE_ID     your Apple ID
    NOTARY_PASSWORD     an app-specific password from appleid.apple.com
    NOTARY_TEAM_ID      your ten-character team ID
MSG
    exit 1
fi

show_log() {
    id="$(grep -oE '\bid: [0-9a-f-]{36}' "$1" | head -1 | awk '{print $2}' || true)"
    [ -n "$id" ] || return 0
    # The one-line status says nothing useful; the log names the binary and the reason.
    echo "--- notarisation log ---" >&2
    xcrun notarytool log "$id" ${notary_args[@]+"${notary_args[@]}"} >&2 || true
}

# --------------------------------------------------------------------------------- submit
#
# One submission for all three bundles. notarytool takes a zip containing several items and
# notarises each of them; three submissions would be three waits for the same answer.
#
# `ditto -c -k --keepParent` rather than `zip`: it is the archiver that reliably preserves the
# extended attributes and symlinks a signed bundle depends on. A bundle round-tripped through `zip`
# can arrive with a broken signature and a rejection that blames the signature.
work="$(mktemp -d)"
staging="$work/Prophet Panel"
mkdir -p "$staging"
for bundle in "${bundles[@]}"; do
    ditto "$bundle" "$staging/$(basename "$bundle")"
done

submission="$work/submission.zip"
ditto -c -k --keepParent "$staging" "$submission"
echo "submitting $(du -h "$submission" | cut -f1) for notarisation…"

# --wait blocks until Apple has an answer: usually a couple of minutes, occasionally much longer.
# Without it the command returns instantly and the staple below fails on a ticket that does not
# exist yet — which reads as a stapling bug rather than a missing wait.
if ! xcrun notarytool submit "$submission" ${notary_args[@]+"${notary_args[@]}"} \
        --wait --timeout 45m 2>&1 | tee "$work/notary.log"; then
    show_log "$work/notary.log"
    exit 1
fi

if grep -q "status: Invalid" "$work/notary.log"; then
    show_log "$work/notary.log"
    exit 1
fi

# --------------------------------------------------------------------------------- staple
#
# The ticket goes onto the bundle, not onto the zip that was submitted. That is what lets the thing
# open on a machine with no network, which is the whole point of stapling.
echo
for bundle in "${bundles[@]}"; do
    echo "stapling $(basename "$bundle")"
    xcrun stapler staple "$bundle"
done

# --------------------------------------------------------------------------------- verify
echo
echo "Gatekeeper assessment (post-notarisation):"
failed=0
for bundle in "${bundles[@]}"; do
    printf '  %-28s ' "$(basename "$bundle")"
    spctl --assess --type install --verbose=2 "$bundle" 2>&1 | tail -1 | sed 's/^[[:space:]]*//' || failed=1
    if ! xcrun stapler validate "$bundle" >/dev/null 2>&1; then
        echo "        stapler validate FAILED"
        failed=1
    fi
done
if [ "$failed" -ne 0 ]; then
    echo "error: a bundle did not pass assessment" >&2
    exit 1
fi

# --------------------------------------------------------------------------------- package
mkdir -p "$outdir"
version="${VERSION:-dev}"

# Rebuilt from the stapled originals, and this is not tidiness. `$staging` was populated *before*
# submission, so it holds pre-staple bundles; zipping it would ship archives with no ticket inside.
# The failure is invisible on any machine with a network — Gatekeeper just asks Apple, gets the
# right answer and assesses as "Notarized Developer ID" — and shows up only on the offline machine
# that stapling exists for in the first place.
rm -rf "$staging"
mkdir -p "$staging"
for bundle in "${bundles[@]}"; do
    ditto "$bundle" "$staging/$(basename "$bundle")"
done

# The architecture is read off the binary rather than assumed. A local build is usually arm64 only
# and CI's is universal; naming both "universal" would put a file on a release page that lies about
# what is inside it, and nobody checks an archive whose name already answered the question.
arch_suffix="unknown"
for probe in "$artefacts/VST3/Prophet Panel.vst3/Contents/MacOS/Prophet Panel" \
             "$artefacts/AU/Prophet Panel.component/Contents/MacOS/Prophet Panel" \
             "$artefacts/Standalone/Prophet Panel.app/Contents/MacOS/Prophet Panel"; do
    [ -e "$probe" ] || continue
    archs="$(lipo -archs "$probe" 2>/dev/null || true)"
    case "$archs" in
        *arm64*x86_64*|*x86_64*arm64*) arch_suffix="universal" ;;
        *arm64*)                       arch_suffix="arm64" ;;
        *x86_64*)                      arch_suffix="x86_64" ;;
    esac
    break
done

archive="$outdir/ProphetPanel-${version}-macOS-${arch_suffix}.zip"
ditto -c -k --keepParent "$staging" "$archive"

installer_identity="${MACOS_INSTALLER_IDENTITY:-}"
if [ -z "$installer_identity" ]; then
    installer_identity="$(security find-identity -v ${KEYCHAIN_PATH:+"$KEYCHAIN_PATH"} 2>/dev/null \
        | grep -m1 "Developer ID Installer" | sed -E 's/.*"(.*)".*/\1/' || true)"
fi

if [ -n "$installer_identity" ]; then
    echo
    echo "building a signed installer as: $installer_identity"
    root="$work/pkgroot"
    mkdir -p "$root/Library/Audio/Plug-Ins/Components" \
             "$root/Library/Audio/Plug-Ins/VST3" \
             "$root/Applications"
    [ -e "$artefacts/AU/Prophet Panel.component" ] && \
        ditto "$artefacts/AU/Prophet Panel.component" \
              "$root/Library/Audio/Plug-Ins/Components/Prophet Panel.component"
    [ -e "$artefacts/VST3/Prophet Panel.vst3" ] && \
        ditto "$artefacts/VST3/Prophet Panel.vst3" \
              "$root/Library/Audio/Plug-Ins/VST3/Prophet Panel.vst3"
    [ -e "$artefacts/Standalone/Prophet Panel.app" ] && \
        ditto "$artefacts/Standalone/Prophet Panel.app" "$root/Applications/Prophet Panel.app"

    pkgbuild --root "$root" --install-location / \
             --identifier "${BUNDLE_ID:-dev.ProphetPanel}.installer" \
             --version "$version" "$work/component.pkg"
    productbuild --package "$work/component.pkg" \
                 --sign "$installer_identity" \
                 "$outdir/ProphetPanel-${version}-macOS.pkg"

    # A .pkg is a different container from the bundles, so it needs its own ticket.
    echo "notarising the installer…"
    xcrun notarytool submit "$outdir/ProphetPanel-${version}-macOS.pkg" \
        ${notary_args[@]+"${notary_args[@]}"} --wait --timeout 45m
    xcrun stapler staple "$outdir/ProphetPanel-${version}-macOS.pkg"
else
    echo
    echo "note: no Developer ID Installer identity, so no .pkg was built."
    echo "      The zips are notarised and stapled — they open with no warning and no"
    echo "      right-click dance. An installer is a nicety and needs a second certificate."
fi

# --------------------------------------------------------------------------------- prove it
#
# Verify the archive rather than the build tree. What ships is the zip, and a ticket stapled to the
# bundle on disk but missing from the copy inside the archive is a bug that every online check
# passes. Unpack it and ask.
echo
echo "verifying the archive that will actually ship:"
verify_dir="$work/verify"
mkdir -p "$verify_dir"
ditto -x -k "$archive" "$verify_dir"

archive_failed=0
for unpacked in "$verify_dir"/*/*; do
    [ -e "$unpacked" ] || continue
    case "$unpacked" in
        *.component|*.vst3|*.app)
            printf '  %-28s ' "$(basename "$unpacked")"
            if xcrun stapler validate "$unpacked" >/dev/null 2>&1; then
                echo "ticket stapled"
            else
                echo "NO TICKET — the archive would fail Gatekeeper offline"
                archive_failed=1
            fi
            ;;
    esac
done
if [ "$archive_failed" -ne 0 ]; then
    echo "error: the packaged archive is missing notarisation tickets" >&2
    exit 1
fi

echo
ls -la "$outdir"
