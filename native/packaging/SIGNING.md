# Signing and notarising

What has to be true for a release to open on someone else's Mac without a warning.

Signing and notarising are **two separate credentials for two separate steps**, and having one does
not give you the other:

| Step | What it does | Needs |
| --- | --- | --- |
| **Sign** | Stamps the bundles with your identity, enables the hardened runtime, attaches an Apple timestamp | a **Developer ID Application** certificate, as a `.p12` |
| **Notarise** | Uploads to Apple, who scan and issue a ticket; the ticket is then stapled to each bundle | an **App Store Connect API key** *or* an **Apple ID + app-specific password** |

A signed-but-not-notarised build still shows Gatekeeper's "cannot be opened" dialog. Both steps are
needed, in that order.

## Repository secrets

The same names as [waveshape](https://github.com/TonyGermaneri/waveshape), whose
`native/tools/setup-signing-secrets.sh` will push them here too.

| Secret | Step | Notes |
| --- | --- | --- |
| `MACOS_CERTIFICATE_P12` | sign | base64 of the exported `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | sign | the export password |
| `MACOS_SIGN_IDENTITY` | sign | optional; only needed when more than one Developer ID Application certificate could match |
| `NOTARY_KEY_P8` | notarise | base64 of the App Store Connect `.p8` |
| `NOTARY_KEY_ID` | notarise | the key's ID |
| `NOTARY_ISSUER_ID` | notarise | the issuer UUID |
| `NOTARY_APPLE_ID` · `NOTARY_PASSWORD` · `NOTARY_TEAM_ID` | notarise | the fallback, if there is no API key. The password is an app-specific one from appleid.apple.com, never the account password |
| `MACOS_INSTALLER_IDENTITY` | package | optional; a **Developer ID Installer** certificate, which is a different certificate from the Application one. Present ⇒ a signed `.pkg` is built as well |

None of these are required for the build to pass. The workflow detects what it has and reports
`signing: false · notarisation: false` rather than failing, so a pull request from a fork still
builds and validates.

## Running it by hand

Both scripts are the same ones CI runs — a signing path that only exists inside a workflow is a
signing path you cannot debug.

```bash
npm run build:native
native/tools/macos-sign.sh native/build/ProphetPanel_artefacts/Release

# Notarising needs credentials in the environment; see the header of the script for both forms.
NOTARY_KEY_PATH=~/Downloads/AuthKey_XXXX.p8 \
NOTARY_KEY_ID=XXXX NOTARY_ISSUER_ID=… VERSION=v0.1.0 \
  native/tools/macos-notarize.sh native/build/ProphetPanel_artefacts/Release dist
```

Locally the identity comes from your login keychain and nothing needs importing. In CI the `.p12`
goes into a throwaway keychain that is deleted when the job ends.

## What "done" looks like

`spctl --assess --type install --verbose=2` on each bundle:

- **before notarising** — `source=Unnotarized Developer ID`. The signature is good; the ticket does
  not exist yet. This is the expected intermediate state, not a failure.
- **after** — `source=Notarized Developer ID`, and `xcrun stapler validate` succeeds.

The notarise script checks the *unpacked archive* rather than the build tree at the end, because a
ticket stapled to the bundle on disk but missing from the copy inside the zip is a bug that every
online check passes and only the offline machine ever sees.
