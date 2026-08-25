import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, posix, relative, resolve } from 'node:path'

import react from '@vitejs/plugin-react'

import { PARAMETERS } from './src/domain/parameters'
import { SECTIONS } from './src/panel/layout'
import type { Plugin, ResolvedConfig } from 'vite'
import { defineConfig } from 'vitest/config'

/** GitHub Pages serves a project site from /<repo>/, so built asset URLs need that prefix. */
const PAGES_BASE = '/prophet-panel/'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/**
 * GitHub Pages has no server-side rewrite, so a request for any path other than the site root
 * 404s. Serving the app from 404.html as well means a deep link or a refresh still lands on the
 * app rather than GitHub's error page.
 */
function spaFallback(): Plugin {
  let outDir = 'dist'
  return {
    name: 'spa-fallback',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const index = resolve(outDir, 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve(outDir, '404.html'))
    },
  }
}

/**
 * Emits the service worker that makes the app installable and usable offline.
 *
 * The precache list is read from the finished build rather than declared by hand, so a new asset
 * can never be left out of the offline cache. It runs in closeBundle because public/ files are
 * copied after the bundle is generated, and the icons and manifest live there.
 */
function pwa(): Plugin {
  let outDir = 'dist'
  let base = '/'
  return {
    name: 'pwa',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outDir = resolve(config.root, config.build.outDir)
      base = config.base
    },
    closeBundle() {
      if (!existsSync(resolve(outDir, 'index.html'))) return

      const files = walk(outDir)
        .map((file) => posix.join(base, relative(outDir, file).split(/[\\/]/).join('/')))
        // 404.html is a duplicate of the shell, and the worker must not cache itself.
        .filter((url) => !url.endsWith('/404.html') && !url.endsWith('/sw.js'))
        .sort()

      // A digest of the precache list, so any change to any asset activates a fresh cache.
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)

      const template = readFileSync(
        resolve(import.meta.dirname, 'src/pwa/serviceWorkerTemplate.js'),
        'utf8',
      )
      const worker = template
        .replace('__PRECACHE__', JSON.stringify(files, null, 2))
        .replace('__VERSION__', version)

      // Substitution replaces the first match only, so a stray mention of a token elsewhere in
      // the template silently consumes it and ships a worker that throws on load. Fail the build.
      const leftover = /__[A-Z]+__/.exec(worker)
      if (leftover) {
        throw new Error(`Service worker placeholder ${leftover[0]} was not substituted`)
      }

      writeFileSync(resolve(outDir, 'sw.js'), worker)
    },
  }
}

/**
 * Drops the `crossorigin` attribute Vite puts on the module script and stylesheet.
 *
 * The plugin's WebView serves the app from a custom scheme through a resource provider, which
 * answers with bytes and a MIME type and no CORS headers at all. Same-origin requests should not
 * care, but a custom scheme's origin is not treated like an ordinary one, and the attribute is
 * enough to turn a working panel into a blank window on some WebView versions. Nothing here needs
 * CORS, so the safest thing is not to ask for it.
 */
function noCrossOrigin(): Plugin {
  return {
    name: 'no-crossorigin',
    apply: 'build',
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin(=("|')anonymous\2)?/g, '')
    },
  }
}

/**
 * Writes the panel's parameters out beside the bundle, for the plug-in to read at startup.
 *
 * A host addresses automation lanes by index and needs them declared before the editor exists, so
 * the native side must have this list before there is anywhere to ask for it. Emitting it here
 * keeps `parameters.ts` the only place a parameter is defined. The order is the order of
 * PARAMETERS, and it must not be shuffled: index 42 meaning something new silently rewires that
 * lane in every session already saved against it.
 */
function parameterManifest(): Plugin {
  // Several parameters share a name — there is a Frequency on each oscillator — so the section is
  // folded in. A host shows a flat list, and two lanes both called "Frequency" are a coin toss.
  const titles = new Map(SECTIONS.map((section) => [section.id, section.title]))
  const titleCase = (text: string) =>
    text.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())

  const entries = [
    ...PARAMETERS.map(({ id, name, section, min, max }) => ({
      id,
      label: `${titleCase(titles.get(section) ?? section)} ${name}`,
      min,
      max,
      kind: 'value' as const,
    })),

    // Two the synthesizer knows nothing about. They step the library the way the buttons beside the
    // patch number do, so a set can be walked from an automation lane.
    { id: 'patchNext', label: 'Patch +', min: 0, max: 1, kind: 'trigger' as const },
    { id: 'patchPrev', label: 'Patch \u2212', min: 0, max: 1, kind: 'trigger' as const },
  ]

  return {
    name: 'parameter-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'parameters.json', source: JSON.stringify(entries, null, 2) })
    },
  }
}

export default defineConfig(({ command, isPreview, mode }) => {
  /**
   * The plugin target is the same app in different furniture. It differs in four ways, all of
   * them here rather than in the app: no service worker (a cache in front of a WebView that is
   * already reading from a binary is pure liability), no Pages base, relative asset URLs so they
   * resolve under the WebView's `juce://juce.backend/` origin, and the native platform behind
   * `@platform`.
   */
  const isPlugin = mode === 'plugin'

  // The dev server keeps the root so http://localhost:5173 works as before; builds — including
  // the ones `vite preview` serves — carry the Pages prefix.
  const webBase = command === 'build' || isPreview ? PAGES_BASE : '/'

  return {
    base: isPlugin ? './' : webBase,
    plugins: isPlugin
      ? [react(), noCrossOrigin(), parameterManifest()]
      : [react(), spaFallback(), pwa()],
    resolve: {
      alias: {
        '@platform': resolve(
          import.meta.dirname,
          isPlugin ? 'src/platform/plugin' : 'src/platform/web',
        ),
        '@library-backend': resolve(
          import.meta.dirname,
          isPlugin ? 'src/library/backend/plugin.ts' : 'src/library/backend/web.ts',
        ),
      },
    },
    // The plugin bundle is built into the native tree, where CMake embeds it as binary data.
    ...(isPlugin ? { build: { outDir: 'native/webui', emptyOutDir: true } } : {}),
    server: {
      port: 5173,
      // localhost is a secure context, so Web MIDI (including sysex) works without TLS.
      host: 'localhost',
    },
    // The factory .syx files live outside src/ and are pulled in as raw bytes by the
    // library seeder via import.meta.glob.
    assetsInclude: ['**/*.syx'],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
    },
  }
})
