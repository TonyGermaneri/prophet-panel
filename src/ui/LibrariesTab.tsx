import { useRef, useState } from 'react'

import { buildBundle } from '../library/bundle'
import { download } from '../library/download'
import { resolveSource } from '../library/manifest'
import { sharedLibraries } from '../library/shared'
import { sources } from '../library/sources'
import { exportGroups, importBundle, summariseImport } from '../library/userPatches'
import { modelName } from '../domain/model'
import { connection } from '../midi'
import { useLibrary } from './useLibrary'
import { useSettings } from './useBindings'
import { useShared, useSources } from './useShared'
import { useUserGroups } from './useUserGroups'

/** The two library-wide scopes; anything else is one user group, addressed by its id. */
type Scope = 'mine' | 'all'

export function LibrariesTab() {
  const list = useSources()
  const shared = useShared()
  const lib = useLibrary()
  const groups = useUserGroups()
  const model = modelName(useSettings().model)

  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope | string>('mine')
  const [bundleName, setBundleName] = useState('')
  const zipInput = useRef<HTMLInputElement>(null)

  const note = (message: string, ms = 3500) => {
    setProgress(message)
    window.setTimeout(() => setProgress(null), ms)
  }

  const add = async () => {
    setAddError(null)
    let where
    try {
      where = resolveSource(url)
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error))
      return
    }
    if (sources.has(where.base)) {
      setAddError('That library is already in the list')
      return
    }
    setAdding(true)
    const source = sources.add({ url: url.trim(), base: where.base, label: where.label })
    await sharedLibraries.load(source)
    setAdding(false)
    const status = sharedLibraries.status(source.id)
    if (status.state === 'error') {
      // Keep the row so the error is visible and can be retried, rather than losing what was typed.
      setAddError(status.error ?? 'Could not read that library')
    } else {
      setUrl('')
    }
  }

  const remove = (id: string) => {
    sources.remove(id)
    sharedLibraries.forget(id)
  }

  const group = groups.own.find((g) => g.id === scope)
  const chosen = group
    ? lib.inGroup(group.id)
    : scope === 'mine'
      ? lib.all.filter((e) => e.source !== 'factory')
      : lib.all

  const exportZip = () => {
    const name = bundleName.trim() || group?.name || `${model} Patches`
    // A group carries its own byline into the manifest; a library-wide scope has none to carry.
    if (group) {
      exportGroups([group], name)
      return
    }
    download(
      `${name}.zip`,
      buildBundle(chosen, { name, createdAt: Date.now(), deviceId: connection.deviceId }),
      'application/zip',
    )
  }

  const importZip = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    try {
      const result = await importBundle(file)
      if (!result.patches) {
        note('No patches found in that zip')
        return
      }
      note(summariseImport(result))
    } catch (error) {
      note(error instanceof Error ? error.message : String(error), 6000)
    }
  }

  return (
    <>
      <section className="dialog-section">
        <h3>Shared libraries</h3>
        <p className="dialog-blurb">
          Point at a folder in a Git repository holding a <code>manifest.json</code> and its{' '}
          <code>.syx</code> files. Each collection in the manifest becomes a tab in the library.
          Shared patches are read fresh every time the app loads and are only ever auditioned —
          they are never written to the instrument's memory.
        </p>

        <div className="source-add">
          <input
            type="url"
            placeholder="github.com/owner/repo/tree/main/patches"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setAddError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim()) void add()
            }}
          />
          <button className="primary" disabled={!url.trim() || adding} onClick={() => void add()}>
            {adding ? 'Reading…' : 'Add'}
          </button>
        </div>
        {addError && <p className="hint warn">{addError}</p>}

        {list.all.length === 0 ? (
          <p className="hint">No shared libraries yet.</p>
        ) : (
          <ul className="source-list">
            {list.all.map((source) => {
              const status = shared.status(source.id)
              const collections = shared.collections.filter((c) => c.sourceId === source.id)
              return (
                <li key={source.id} className={`source ${status.state}`}>
                  <div className="source-row">
                    <label className="source-toggle">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        onChange={(e) => {
                          sources.update(source.id, { enabled: e.target.checked })
                          if (e.target.checked) {
                            void sharedLibraries.load({ ...source, enabled: true })
                          } else {
                            sharedLibraries.forget(source.id)
                          }
                        }}
                      />
                      <span className="source-name">{status.manifest?.name ?? source.label}</span>
                    </label>
                    <div className="source-actions">
                      <button
                        className="link"
                        disabled={!source.enabled || status.state === 'loading'}
                        onClick={() => void sharedLibraries.load(source)}
                      >
                        {status.state === 'loading' ? 'Reading…' : 'Reload'}
                      </button>
                      <button className="link danger" onClick={() => remove(source.id)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <p className="source-url" title={source.base}>
                    {source.url}
                  </p>

                  {status.state === 'error' && <p className="hint warn">{status.error}</p>}
                  {status.warning && <p className="hint warn">{status.warning}</p>}
                  {status.state === 'ready' && (
                    <p className="source-meta">
                      {status.patches} patches ·{' '}
                      {collections.map((c) => c.name).join(', ') || 'no collections'}
                      {status.manifest?.author ? ` · by ${status.manifest.author}` : ''}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="dialog-section">
        <h3>Share as a file</h3>
        <p className="dialog-blurb">
          A zip holds the same thing a shared folder does — a manifest and one <code>.syx</code>{' '}
          per bank or group — so a zip can be unpacked straight into a repository and published,
          and a published folder can be zipped and sent to someone. Importing one adds a tab of its
          own named after the file; importing the same filename again replaces what it left behind.
        </p>

        <label className="field wide">
          <span>Bundle name</span>
          <input
            type="text"
            value={bundleName}
            onChange={(e) => setBundleName(e.target.value)}
            placeholder={group?.name ?? `${model} Patches`}
          />
        </label>

        <label className="field wide">
          <span>Contents</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="mine">
              Everything of yours — saved, imported, received and grouped (
              {lib.all.filter((e) => e.source !== 'factory').length})
            </option>
            <option value="all">Everything in the library ({lib.all.length})</option>
            {groups.own.map((g) => (
              <option key={g.id} value={g.id}>
                Group: {g.name} ({lib.inGroup(g.id).length})
              </option>
            ))}
          </select>
        </label>

        <div className="dialog-actions">
          <button className="primary" disabled={!chosen.length} onClick={exportZip}>
            Export {chosen.length} {chosen.length === 1 ? 'patch' : 'patches'} as .zip
          </button>
          <button onClick={() => zipInput.current?.click()}>Import .zip</button>
        </div>
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
        {progress && <p className="progress">{progress}</p>}
      </section>
    </>
  )
}
