/**
 * Settings in the plugin.
 *
 * Reads are synchronous because the app reads its settings while its modules initialise, long
 * before it could await anything. The native side makes that possible by injecting the whole map
 * ahead of the first script, so reads hit memory and only writes cross the bridge.
 */

import type { KeyValueStore } from '../types'
import { bootstrap, call } from './bridge'

const snapshot = bootstrap().kv

export const nativeKv: KeyValueStore = {
  get(key) {
    return Object.prototype.hasOwnProperty.call(snapshot, key) ? snapshot[key] : null
  },
  set(key, value) {
    snapshot[key] = value
    void call('kvSet', key, value)
  },
}
