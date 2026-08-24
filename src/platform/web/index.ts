/**
 * The browser platform: Web MIDI, localStorage, and a download link.
 *
 * This is what `@platform` resolves to unless the build says otherwise, so the PWA is unaffected
 * by the existence of the plugin target.
 */

import type { Platform } from '../types'
import { webKv } from './kv'
import { WebMidiBackend } from './midi'

export const platform: Platform = {
  name: 'web',
  midi: new WebMidiBackend(),
  kv: webKv,
  saveFile(name, bytes, type = 'application/octet-stream') {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as BlobPart], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  },
}

export * from '../types'
