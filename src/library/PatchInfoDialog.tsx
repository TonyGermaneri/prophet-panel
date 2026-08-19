import { useState } from 'react'

import { slotLabel } from '../domain/patch'
import { Modal } from '../ui/Modal'
import { useUserGroups } from '../ui/useUserGroups'
import { type LibraryEntry } from './db'
import { savePatch } from './userPatches'

/** Dates are shown, never typed: every one of them is recorded by the app itself. */
export function formatDate(ms: number | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function parseTags(text: string): string[] | undefined {
  const tags = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return tags.length ? tags : undefined
}

/**
 * What a patch is, beyond its bytes.
 *
 * The instrument's own name field is twenty characters of upper case and nothing else, so anything
 * worth saying about a sound has to be said here. Patches belonging to someone else — a shared
 * collection, or a bundle somebody sent — are shown rather than edited: their author's byline is
 * not ours to rewrite.
 */
export function PatchInfoDialog({
  entry,
  onClose,
}: {
  entry: LibraryEntry
  onClose: () => void
}) {
  const groups = useUserGroups()
  const [name, setName] = useState(entry.name)
  const [author, setAuthor] = useState(entry.meta?.author ?? '')
  const [description, setDescription] = useState(entry.meta?.description ?? '')
  const [tags, setTags] = useState((entry.meta?.tags ?? []).join(', '))
  const [groupId, setGroupId] = useState(entry.groupId ?? '')

  const editable = entry.source !== 'shared' && entry.source !== 'factory'
  const group = entry.groupId ? groups.group(entry.groupId) : undefined

  const save = async () => {
    await savePatch(entry, {
      name,
      meta: {
        author: author.trim() || undefined,
        description: description.trim() || undefined,
        tags: parseTags(tags),
      },
      groupId: groupId === (entry.groupId ?? '') ? undefined : groupId || null,
    })
    onClose()
  }

  return (
    <Modal title="Patch info" onClose={onClose}>
      <section className="dialog-section">
        <p className="status-line">
          <span className="entry-slot">{slotLabel(entry.group, entry.program)}</span>
          {group?.bundle ? `From ${group.bundle.file}.zip` : (group?.name ?? entry.bank)}
          {' · added '}
          {formatDate(entry.meta?.createdAt ?? entry.updatedAt)}
        </p>

        {editable ? (
          <>
            <label className="field wide">
              <span>Name</span>
              <input
                type="text"
                className="patch-name"
                value={name}
                maxLength={20}
                spellCheck={false}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="field wide">
              <span>Author</span>
              <input
                type="text"
                value={author}
                placeholder="Who made this sound"
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>

            <label className="field wide top">
              <span>About</span>
              <textarea
                rows={3}
                value={description}
                placeholder="What it is, what it is for"
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <label className="field wide">
              <span>Tags</span>
              <input
                type="text"
                value={tags}
                placeholder="pad, soft, evolving"
                onChange={(e) => setTags(e.target.value)}
              />
            </label>

            <label className="field wide">
              <span>Group</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">— ungrouped, filed by slot —</option>
                {groups.own.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                {/* A patch can be lifted out of an imported bundle, but not filed back into one. */}
                {group?.bundle && (
                  <option value={group.id}>{group.name} (from {group.bundle.file}.zip)</option>
                )}
              </select>
            </label>

            <p className="dialog-blurb">
              The name is the instrument's own twenty characters and travels in the patch itself.
              The rest travels beside it, in the manifest of any bundle this is exported into.
            </p>

            <div className="dialog-actions">
              <button className="primary" onClick={() => void save()}>
                Save
              </button>
              <button onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <dl className="patch-meta">
              <dt>Name</dt>
              <dd>{entry.name}</dd>
              <dt>Author</dt>
              <dd>{entry.meta?.author ?? '—'}</dd>
              <dt>About</dt>
              <dd>{entry.meta?.description ?? '—'}</dd>
              <dt>Tags</dt>
              <dd>{entry.meta?.tags?.join(', ') || '—'}</dd>
              <dt>Written</dt>
              <dd>{formatDate(entry.meta?.createdAt)}</dd>
            </dl>
            <p className="dialog-blurb">
              {entry.source === 'factory'
                ? 'A factory program, as the instrument shipped it.'
                : 'This patch belongs to whoever published it. Copy it into a group of your own to edit its details.'}
            </p>
          </>
        )}
      </section>
    </Modal>
  )
}
