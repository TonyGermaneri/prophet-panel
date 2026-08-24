/**
 * The bridge to the native shell.
 *
 * Two directions, both narrow. Calls out are functions the C++ side registered with
 * `withNativeFunction`; messages in are events it emits with `emitEventIfBrowserIsVisible`.
 * Everything crossing here is JSON, so raw MIDI and patch bytes travel as base64.
 */

import { getNativeFunction } from '@juce-framework/webview'

const cache = new Map<string, (...args: unknown[]) => Promise<unknown>>()

/**
 * Bound lazily rather than at module scope. The JUCE shim installs itself before this bundle runs,
 * but there is no reason to depend on that ordering.
 */
export function call(name: string, ...args: unknown[]): Promise<unknown> {
  let fn = cache.get(name)
  if (fn === undefined) {
    fn = getNativeFunction(name)
    cache.set(name, fn)
  }
  return fn(...args)
}

export function listen(event: string, fn: (payload: unknown) => void): () => void {
  const handle = window.__JUCE__.backend.addEventListener(event, fn)
  return () => window.__JUCE__.backend.removeEventListener(handle)
}

/** What the native side injected before the app's first script ran. */
export interface Bootstrap {
  kv: Record<string, string>
  /** The patch the panel held when the host last saved the session, base64'd. */
  session: string
}

export function bootstrap(): Bootstrap {
  const injected = (window as unknown as { __PROPHET__?: Partial<Bootstrap> }).__PROPHET__
  return { kv: injected?.kv ?? {}, session: injected?.session ?? '' }
}

export function toBase64(bytes: Uint8Array): string {
  // Chunked: spreading a whole bank into fromCharCode would exceed the argument limit.
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
