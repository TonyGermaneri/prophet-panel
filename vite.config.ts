import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import type { Plugin, ResolvedConfig } from 'vite'
import { defineConfig } from 'vitest/config'

/** GitHub Pages serves a project site from /<repo>/, so built asset URLs need that prefix. */
const PAGES_BASE = '/prophet-panel/'

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

export default defineConfig(({ command, isPreview }) => ({
  // The dev server keeps the root so http://localhost:5173 works as before; builds — including
  // the ones `vite preview` serves — carry the Pages prefix.
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react(), spaFallback()],
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
