import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, posix, relative, resolve } from 'node:path'

import react from '@vitejs/plugin-react'
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

export default defineConfig(({ command, isPreview }) => ({
  // The dev server keeps the root so http://localhost:5173 works as before; builds — including
  // the ones `vite preview` serves — carry the Pages prefix.
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react(), spaFallback(), pwa()],
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
}))
