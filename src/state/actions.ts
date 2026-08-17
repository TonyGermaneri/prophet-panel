/**
 * Panel buttons that move the instrument rather than hold a value of their own (program select,
 * bank/group select, factory, tune) dispatch a named action instead of writing to the patch store.
 * Handlers are registered by the app once MIDI is wired up, which keeps the panel components free
 * of MIDI imports.
 */

export type PanelAction =
  | 'program1'
  | 'program2'
  | 'program3'
  | 'program4'
  | 'program5'
  | 'program6'
  | 'program7'
  | 'program8'
  | 'bankSelect'
  | 'groupSelect'
  | 'factory'
  | 'tune'
  | 'record'

const handlers = new Map<PanelAction, () => void>()

export function registerActions(next: Partial<Record<PanelAction, () => void>>): () => void {
  const keys = Object.keys(next) as PanelAction[]
  for (const key of keys) handlers.set(key, next[key]!)
  return () => {
    for (const key of keys) handlers.delete(key)
  }
}

export function dispatchAction(action: PanelAction): void {
  handlers.get(action)?.()
}
