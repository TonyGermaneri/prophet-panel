import { useSyncExternalStore } from 'react'

import { connection, type ConnectionState, type DeviceInfo, type PortInfo } from '../midi'

export interface MidiStatus {
  state: ConnectionState
  device: DeviceInfo | null
  deviceId: number
  inputs: PortInfo[]
  outputs: PortInfo[]
  inputId: string | null
  outputId: string | null
}

let cached: MidiStatus = {
  state: 'idle',
  device: null,
  deviceId: 0,
  inputs: [],
  outputs: [],
  inputId: null,
  outputId: null,
}

/** useSyncExternalStore requires a stable snapshot, so rebuild only when something has changed. */
function snapshot(): MidiStatus {
  const next: MidiStatus = {
    state: connection.state,
    device: connection.device,
    deviceId: connection.deviceId,
    inputs: connection.inputs,
    outputs: connection.outputs,
    inputId: connection.input?.id ?? null,
    outputId: connection.output?.id ?? null,
  }
  const same =
    cached.state === next.state &&
    cached.device === next.device &&
    cached.deviceId === next.deviceId &&
    cached.inputId === next.inputId &&
    cached.outputId === next.outputId &&
    cached.inputs.length === next.inputs.length &&
    cached.outputs.length === next.outputs.length &&
    cached.inputs.every((p, i) => p.id === next.inputs[i].id) &&
    cached.outputs.every((p, i) => p.id === next.outputs[i].id)
  if (!same) cached = next
  return cached
}

export function useMidiStatus(): MidiStatus {
  return useSyncExternalStore(
    (fn) => connection.onStateChange(fn),
    snapshot,
    snapshot,
  )
}
