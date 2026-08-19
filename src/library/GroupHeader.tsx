import { useRef } from 'react'

import { formatDate } from './PatchInfoDialog'
import { type UserGroup } from './userGroups'
import { addCurrentPatch, addFiles, deleteGroups, exportGroups } from './userPatches'

/**
 * A group's heading and everything that acts on the group as a whole.
 *
 * Adding sits here rather than in one shared toolbar because a patch has to land somewhere: with
 * the buttons on the group, the group you clicked is the answer, and there is no hidden "current
 * folder" to get out of step with what is on screen.
 */
export function GroupHeader({
  group,
  count,
  onEdit,
  onNote,
}: {
  group: UserGroup
  count: number
  /** Absent for an imported group, whose name and byline belong to whoever sent it. */
  onEdit?: () => void
  onNote: (message: string) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)

  const addCurrent = async () => {
    const entry = await addCurrentPatch(group.id)
    onNote(`Added ${entry.name} to ${group.name}`)
  }

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    const { added, skipped } = await addFiles(group.id, files)
    const missed = skipped.length
      ? `, ${skipped.length} file${skipped.length === 1 ? '' : 's'} held no patches`
      : ''
    onNote(
      added.length
        ? `Added ${added.length} ${added.length === 1 ? 'patch' : 'patches'}${missed}`
        : 'No patches in those files',
    )
  }

  const remove = async () => {
    await deleteGroups([group.id])
    onNote(`Deleted ${group.name}`)
  }

  const send = () => {
    const total = exportGroups([group])
    onNote(total ? `Exported ${total} patches` : 'Nothing to export')
  }

  return (
    <div className="group-head">
      <h3 title={group.description}>{group.name}</h3>
      <span className="count">{count}</span>
      {group.author && <span className="group-by">by {group.author}</span>}
      <span className="group-date">{formatDate(group.createdAt)}</span>

      <div className="group-actions">
        <button className="link" onClick={() => void addCurrent()} title="File the patch on the panel here">
          + Panel
        </button>
        <button className="link" onClick={() => fileInput.current?.click()} title="Add .syx files">
          + Files
        </button>
        <button className="link" disabled={!count} onClick={send} title="Export this group as a zip">
          Export
        </button>
        {onEdit && (
          <button className="link" onClick={onEdit} title="Name, author and description">
            Edit
          </button>
        )}
        <button className="link danger" onClick={() => void remove()} title="Delete the group and its patches">
          Delete
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".syx"
        multiple
        hidden
        onChange={(e) => {
          void add(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
