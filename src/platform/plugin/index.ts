/**
 * The plugin platform: the host's MIDI, native settings, and a native save panel.
 *
 * `@platform` resolves here only for `vite build --mode plugin`; the browser build never sees any
 * of it, and never pulls in the JUCE frontend package.
 */

import type { Platform } from '../types'
import { bootstrap, call, fromBase64, listen, toBase64 } from './bridge'
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
  automation: {
    onChange(fn) {
      // One event per tick carrying every control that moved, rather than one per control: an
      // automation sweep changes a value every audio block, and the panel only draws frames.
      return listen('pp:params', (payload) => {
        for (const change of (payload as { id: string; value: number }[] | null) ?? []) {
          fn(change.id, change.value)
        }
      })
    },
    set(id, value) {
      void call('paramSet', id, value)
    },
  },
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
