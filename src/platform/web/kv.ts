/**
 * Settings storage for the browser.
 *
 * Every read and write is guarded: private browsing and full quotas both throw, and neither is a
 * reason for the app to fail to start. A lost write costs the preference for the session, nothing
 * more.
 */

import type { KeyValueStore } from '../types'

export const webKv: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // The value still applies for this session; only its persistence is lost.
    }
  },
}
