/**
 * The plugin platform: the host's MIDI, native settings, and a native save panel.
 *
 * `@platform` resolves here only for `vite build --mode plugin`; the browser build never sees any
 * of it, and never pulls in the JUCE frontend package.
 */

import type { Platform } from '../types'
import { bootstrap, call, fromBase64, toBase64 } from './bridge'
import { nativeKv } from './kv'
import { NativeMidiBackend } from './midi'

export const platform: Platform = {
  name: 'plugin',
  midi: new NativeMidiBackend(),
  kv: nativeKv,
  saveFile(name, bytes) {
    void call('saveFile', name, toBase64(bytes))
  },
  resizeWindow(width, height) {
    void call('resizeWindow', width, height)
  },
  windowSizeRestored: bootstrap().sizeRestored,
  session: {
    get() {
      const injected = bootstrap().session
      return injected ? fromBase64(injected) : null
    },
    set(payload) {
      void call('sessionSet', toBase64(payload))
    },
  },
}

export * from '../types'
