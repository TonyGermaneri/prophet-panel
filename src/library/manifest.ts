/**
 * Shared patch libraries: a directory containing `manifest.json` and the `.syx` files it names.
 *
 * The same layout serves both sharing routes. Point the app at a GitHub directory and it reads the
 * manifest over raw.githubusercontent.com; export a zip and you get that directory in a file. A zip
 * can therefore be unpacked into a repo and published as-is, and a published directory can be
 * zipped and mailed to someone, with no conversion either way.
 *
 * A manifest is untrusted content from someone else's repository. It may name collections and list
 * files inside its own directory, and that is all: file references are validated as relative paths
 * that cannot climb out of the directory or address another host, so a manifest cannot use this app
 * to fetch something the user did not point it at.
 *
 * Authorship travels here too. A .syx program has no room for a byline, a date or a sentence about
 * what the sound is for, so the manifest carries them alongside the files — which also means they
 * are readable and diffable in the repository rather than buried in a binary.
 */

/**
 * What a manifest says about one program. `index` counts programs across the collection's files in
 * the order `files` lists them, so metadata survives a reader that merges the files into one list.
 */
export interface SharedPatchMeta {
  index: number
  name?: string
  author?: string
  description?: string
  tags?: string[]
  /** ISO 8601. A committed manifest should read as text, not as an epoch integer. */
  createdAt?: string
}

export interface SharedCollection {
  id: string
  name: string
  description?: string
  author?: string
  createdAt?: string
  /** Paths relative to the manifest's own directory. */
  files: string[]
  patches?: SharedPatchMeta[]
}

export interface SharedManifest {
  version: number
  name: string
  description?: string
  author?: string
  createdAt?: string
  collections: SharedCollection[]
}

/** Epoch milliseconds to the manifest's date form, and back. Either may legitimately be absent. */
export function toIsoDate(ms: number | undefined): string | undefined {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

export function fromIsoDate(text: string | undefined): number | undefined {
  if (typeof text !== 'string' || !text.trim()) return undefined
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? undefined : ms
}

export const MANIFEST_FILE = 'manifest.json'
export const MANIFEST_VERSION = 1

/** A source's location, reduced to the directory its manifest sits in. */
export interface SourceLocation {
  /** Absolute URL of the directory, with a trailing slash. */
  base: string
  /** Something readable to show before the manifest has been fetched. */
  label: string
}

const GITHUB_PAGE = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)(\/.*)?)?\/?$/i
const GITHUB_RAW = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(\/.*)?$/i
const SHORTHAND = /^([\w.-]+)\/([\w.-]+)(\/.*)?$/

function rawUrl(owner: string, repo: string, ref: string, path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  return `https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, '')}/${ref}/${clean ? clean + '/' : ''}`
}

function labelFor(owner: string, repo: string, path: string): string {
  const dir = path.replace(/^\/+|\/+$/g, '').split('/').pop()
  return dir ? `${owner}/${repo} · ${dir}` : `${owner}/${repo}`
}

/**
 * Turn whatever the user pasted into the directory the manifest lives in.
 *
 * GitHub's own URLs are what people actually have in their clipboard, so a `/tree/` browse URL, a
 * `/blob/` link to the manifest itself, a raw URL and plain `owner/repo` shorthand all resolve to
 * the same place. Anything else that is a URL is taken at face value, which is what makes this work
 * with GitLab, a Pages site or a plain web server.
 */
export function resolveSource(input: string): SourceLocation {
  const text = input.trim()
  if (!text) throw new Error('Enter a repository URL')

  // A link straight to the manifest names a file; the directory is what we want.
  const stripManifest = (path: string) =>
    path.replace(new RegExp(`/${MANIFEST_FILE}$`, 'i'), '')

  const page = GITHUB_PAGE.exec(text)
  if (page) {
    const [, owner, repo, ref, path = ''] = page
    // Without a /tree/ segment there is no branch in the URL. HEAD resolves to the default branch,
    // whatever it is called, rather than guessing at "main".
    const dir = stripManifest(path)
    return { base: rawUrl(owner, repo, ref || 'HEAD', dir), label: labelFor(owner, repo, dir) }
  }

  const raw = GITHUB_RAW.exec(text)
  if (raw) {
    const [, owner, repo, ref, path = ''] = raw
    const dir = stripManifest(path)
    return { base: rawUrl(owner, repo, ref, dir), label: labelFor(owner, repo, dir) }
  }

  if (/^https?:\/\//i.test(text)) {
    const url = new URL(stripManifest(text))
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return { base: url.toString(), label: url.host + url.pathname }
  }

  const short = SHORTHAND.exec(stripManifest(text))
  if (short) {
    const [, owner, repo, path = ''] = short
    return { base: rawUrl(owner, repo, 'HEAD', path), label: labelFor(owner, repo, path) }
  }

  throw new Error('Not a repository URL — try a GitHub link or owner/repo')
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Manifest ${field} is missing`)
  return value.trim()
}

/** Optional prose. Anything that is not a non-empty string simply is not there. */
function optional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Patch metadata is decoration: a malformed entry costs its own byline, never the programs. So
 * unlike `files`, nothing here throws — bad values are dropped and the rest is kept.
 */
function parsePatchMeta(value: unknown): SharedPatchMeta[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list: SharedPatchMeta[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    if (typeof p.index !== 'number' || !Number.isInteger(p.index) || p.index < 0) continue
    const tags = Array.isArray(p.tags)
      ? p.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim())
      : undefined
    list.push({
      index: p.index,
      name: optional(p.name),
      author: optional(p.author),
      description: optional(p.description),
      tags: tags?.length ? tags : undefined,
      createdAt: optional(p.createdAt),
    })
  }
  return list.length ? list : undefined
}

/**
 * A file reference has to stay inside the source directory. Rejecting schemes, absolute paths and
 * `..` segments is what keeps a manifest from pointing the app at an unrelated host or walking up
 * out of the directory the user chose.
 */
export function resolveFile(base: string, file: string): string {
  const path = file.trim()
  if (!path) throw new Error('Manifest lists an empty filename')
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) {
    throw new Error(`Manifest may only list files inside its own directory: ${path}`)
  }
  if (path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error(`Manifest may only list files inside its own directory: ${path}`)
  }
  const resolved = new URL(path, base)
  if (!resolved.href.startsWith(base)) {
    throw new Error(`Manifest may only list files inside its own directory: ${path}`)
  }
  return resolved.href
}

export function parseManifest(json: unknown): SharedManifest {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Manifest is not a JSON object')
  }
  const raw = json as Record<string, unknown>
  const version = typeof raw.version === 'number' ? raw.version : 0
  if (version !== MANIFEST_VERSION) {
    throw new Error(`Manifest version ${version || '?'} is not supported (expected ${MANIFEST_VERSION})`)
  }
  if (!Array.isArray(raw.collections) || !raw.collections.length) {
    throw new Error('Manifest lists no collections')
  }

  const collections = raw.collections.map((entry, i): SharedCollection => {
    if (!entry || typeof entry !== 'object') throw new Error(`Collection ${i + 1} is not an object`)
    const c = entry as Record<string, unknown>
    if (!Array.isArray(c.files) || !c.files.length) {
      throw new Error(`Collection ${i + 1} lists no files`)
    }
    return {
      id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `collection-${i + 1}`,
      name: asString(c.name, `collection ${i + 1} name`),
      description: typeof c.description === 'string' ? c.description : undefined,
      author: optional(c.author),
      createdAt: optional(c.createdAt),
      files: c.files.map((f, j) => {
        if (typeof f !== 'string') throw new Error(`Collection ${i + 1} file ${j + 1} is not a path`)
        return f
      }),
      patches: parsePatchMeta(c.patches),
    }
  })

  return {
    version,
    name: asString(raw.name, 'name'),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    createdAt: optional(raw.createdAt),
    collections,
  }
}

export async function fetchManifest(base: string, signal?: AbortSignal): Promise<SharedManifest> {
  const url = new URL(MANIFEST_FILE, base).href
  let response: Response
  try {
    response = await fetch(url, { signal, cache: 'no-cache' })
  } catch {
    // A cross-origin fetch that is blocked reports nothing useful, so say what is worth checking.
    throw new Error('Could not reach the repository — check the URL and that it is public')
  }
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `No ${MANIFEST_FILE} in that directory`
        : `Repository returned ${response.status}`,
    )
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new Error(`${MANIFEST_FILE} is not valid JSON`)
  }
  return parseManifest(json)
}
