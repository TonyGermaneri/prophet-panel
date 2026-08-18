import { useState } from 'react'

import { bankOf, programInBank, toSyxFile } from '../domain/patch'
import { connection } from '../midi'
import { Modal } from '../ui/Modal'
import { useLibrary } from '../ui/useLibrary'
import { usePatchMeta } from '../state/hooks'
import { type LibraryEntry, patchFromEntry } from './db'
import { download } from './download'

/** The instrument's own export scopes, so the choice reads the same here as on the front panel. */
type Scope = 'program' | 'bank' | 'group' | 'user' | 'all'

const SCOPES: { id: Scope; label: string; hint: string }[] = [
  { id: 'program', label: 'Program', hint: 'The patch currently selected' },
  { id: 'bank', label: 'Bank', hint: 'The eight patches in the current bank' },
  { id: 'group', label: 'Group', hint: 'All forty patches in the current group' },
  { id: 'user', label: 'User', hint: 'Everything you saved, imported or received' },
  { id: 'all', label: 'All', hint: 'The entire library' },
]

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const lib = useLibrary()
  const meta = usePatchMeta()
  const [scope, setScope] = useState<Scope>('group')

  const select = (id: Scope): LibraryEntry[] => {
    const all = lib.all
    switch (id) {
      case 'program': {
        const one = lib.selectedId ? lib.entry(lib.selectedId) : lib.entryAtSlot(meta.group, meta.program)
        return one ? [one] : []
      }
      case 'bank':
        return all.filter(
          (e) => e.group === meta.group && bankOf(e.program) === bankOf(meta.program),
        )
      case 'group':
        return all.filter((e) => e.group === meta.group)
      case 'user':
        return all.filter((e) => e.source !== 'factory')
      case 'all':
        return all
    }
  }

  const filename = (id: Scope): string => {
    const g = meta.group + 1
    switch (id) {
      case 'program':
        return `${g}${bankOf(meta.program)}${programInBank(meta.program)} ${select('program')[0]?.name ?? 'patch'}.syx`
      case 'bank':
        return `Prophet-10 Group ${g} Bank ${bankOf(meta.program)}.syx`
      case 'group':
        return `Prophet-10 Group ${g}.syx`
      case 'user':
        return 'Prophet-10 User Patches.syx'
      case 'all':
        return 'Prophet-10 All Patches.syx'
    }
  }

  const chosen = select(scope)

  return (
    <Modal title="Export" onClose={onClose}>
      <section className="dialog-section">
        <p className="dialog-blurb">
          Save patches as a SysEx file. Programs keep the group and program they came from, so they
          load back into the same slots.
        </p>

        <ul className="scope-list">
          {SCOPES.map((s) => {
            const count = select(s.id).length
            return (
              <li key={s.id}>
                <label className={count ? 'scope' : 'scope empty'}>
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === s.id}
                    disabled={!count}
                    onChange={() => setScope(s.id)}
                  />
                  <span className="scope-label">{s.label}</span>
                  <span className="scope-hint">{s.hint}</span>
                  <span className="scope-count">{count}</span>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="dialog-actions">
          <button
            className="primary"
            disabled={!chosen.length}
            onClick={() => {
              download(filename(scope), toSyxFile(chosen.map(patchFromEntry), connection.deviceId))
              onClose()
            }}
          >
            Export {chosen.length} {chosen.length === 1 ? 'patch' : 'patches'}
          </button>
        </div>
      </section>
    </Modal>
  )
}
