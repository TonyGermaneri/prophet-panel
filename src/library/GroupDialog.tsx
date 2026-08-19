import { useState } from 'react'

import { Modal } from '../ui/Modal'
import { renameGroup } from './userPatches'
import { type UserGroup, userGroups } from './userGroups'

/**
 * Naming a group, and saying who made it and what it is.
 *
 * The same three fields become the manifest's when the group is exported, which is why they are
 * worth asking for up front rather than leaving a folder called "Untitled" to be published.
 */
export function GroupDialog({
  group,
  onClose,
  onCreated,
}: {
  /** The group being edited, or undefined to make a new one. */
  group?: UserGroup
  onClose: () => void
  onCreated?: (group: UserGroup) => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [author, setAuthor] = useState(group?.author ?? '')

  const save = async () => {
    const fields = {
      name: name.trim(),
      description: description.trim() || undefined,
      author: author.trim() || undefined,
    }
    if (!fields.name) return
    if (group) {
      await renameGroup(group.id, fields)
    } else {
      onCreated?.(await userGroups.create(fields))
    }
    onClose()
  }

  return (
    <Modal title={group ? 'Edit group' : 'New group'} onClose={onClose}>
      <section className="dialog-section">
        <label className="field wide">
          <span>Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            placeholder="Pads"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
        </label>

        <label className="field wide">
          <span>Author</span>
          <input
            type="text"
            value={author}
            placeholder="Who made these"
            onChange={(e) => setAuthor(e.target.value)}
          />
        </label>

        <label className="field wide top">
          <span>About</span>
          <textarea
            rows={3}
            value={description}
            placeholder="What this group is for"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <p className="dialog-blurb">
          These become the bundle's manifest when the group is exported, so a zip arrives at the
          other end already saying what it is and who wrote it.
        </p>

        <div className="dialog-actions">
          <button className="primary" disabled={!name.trim()} onClick={() => void save()}>
            {group ? 'Save' : 'Create group'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </section>
    </Modal>
  )
}
