import { useRef, useState } from 'react'

import { type BundleView, type UserGroup } from './userGroups'
import { deleteGroups, exportGroups, importBundle, summariseImport } from './userPatches'

/**
 * The strip under the tabs: what can be done to a whole tab rather than to one patch.
 *
 * The User tab makes groups and takes zips in; a bundle's tab sends the same zip back out or drops
 * it. Nothing here touches the instrument — filing patches is a librarian's job, not a player's.
 */
export function UserTools({
  bundle,
  onNewGroup,
  onNote,
}: {
  /** Set when the strip belongs to an imported bundle's tab rather than to the User tab. */
  bundle?: BundleView
  onNewGroup: () => void
  onNote: (message: string) => void
}) {
  const zipInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const importZip = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const result = await importBundle(file)
      onNote(result.patches ? summariseImport(result) : `No patches in ${file.name}`)
    } catch (error) {
      onNote(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const removeBundle = async (view: BundleView) => {
    await deleteGroups(view.groups.map((g) => g.id))
    onNote(`Removed ${view.file}`)
  }

  const exportAll = (groups: UserGroup[], name: string) => {
    const count = exportGroups(groups, name)
    onNote(count ? `Exported ${count} patches` : 'Nothing to export')
  }

  if (bundle) {
    return (
      <div className="user-tools">
        <span className="user-tools-note">
          {bundle.origin.name && bundle.origin.name !== bundle.file ? `${bundle.origin.name} · ` : ''}
          {bundle.groups.length} group{bundle.groups.length === 1 ? '' : 's'}
          {bundle.origin.author ? ` · by ${bundle.origin.author}` : ''}
        </span>
        <button className="link" onClick={() => exportAll(bundle.groups, bundle.file)}>
          Export .zip
        </button>
        <button className="link danger" onClick={() => void removeBundle(bundle)}>
          Remove
        </button>
      </div>
    )
  }

  return (
    <div className="user-tools">
      <button className="link" onClick={onNewGroup}>
        New group
      </button>
      <button className="link" disabled={busy} onClick={() => zipInput.current?.click()}>
        {busy ? 'Reading…' : 'Import .zip'}
      </button>
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          void importZip(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
