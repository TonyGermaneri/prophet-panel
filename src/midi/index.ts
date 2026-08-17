import { store } from '../state/store'
import { connection } from './connection'
import { SynthSync } from './sync'

export { connection } from './connection'
export type { ConnectionState, DeviceInfo, PortInfo } from './connection'

/** One sync bridge for the app; started once the React tree mounts. */
export const sync = new SynthSync(connection, store)
