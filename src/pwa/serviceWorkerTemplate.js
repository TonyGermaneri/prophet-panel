/**
 * Service worker template. The two placeholder tokens below are substituted at build time by the
 * pwa() plugin in vite.config.ts with the real hashed filenames and a build digest, so this file
 * is not valid JavaScript on its own and is never served as-is.
 *
 * The tokens are deliberately not named in this comment: substitution replaces the first match,
 * so a mention up here would be consumed instead of the code below.
 *
 * Caching strategy, and why:
 *
 *   Navigations   network first, falling back to the cached shell. Online you always get the
 *                 current build; offline the app still opens. A cache-first shell would keep
 *                 serving a stale index.html pointing at assets a new deploy has already removed.
 *   /assets/*     cache first. Those filenames contain a content hash, so a hit can never be
 *                 stale and a miss is a genuinely new file.
 *   everything    cache first with a network fallback: the icons, manifest and factory banks,
 *   else          which change only with a deploy.
 *
 * The cache name carries the build version, so activating a new worker drops every older cache
 * rather than leaving a previous build's assets to accumulate.
 *
 * Every lookup passes `ignoreVary`. Static hosts commonly send `Vary: Origin` on assets, and Vite
 * marks its module scripts `crossorigin`, so the browser's request carries an `Origin` header that
 * the precache request did not. Without ignoreVary the Vary comparison fails, every script and
 * stylesheet misses, and the worker falls through to a network that is not there — the app opens
 * to a blank page offline while the manifest and icons load perfectly.
 */

/** Same-origin assets never genuinely vary, so Vary must not be allowed to defeat a match. */
const MATCH = { ignoreVary: true }

const VERSION = '__VERSION__'
const CACHE = `prophet-panel-${VERSION}`
const PRECACHE = __PRECACHE__
const SHELL = PRECACHE.find((url) => url.endsWith('index.html')) ?? './'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // Individually, so one unreachable file cannot fail the whole install.
      await Promise.all(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name.startsWith('prophet-panel-') && name !== CACHE).map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cache = await caches.open(CACHE)
          return (await cache.match(SHELL, MATCH)) ?? Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(request, MATCH)
      if (hit) return hit
      const response = await fetch(request)
      // Only successful same-origin responses are worth keeping.
      if (response.ok && response.type === 'basic') cache.put(request, response.clone())
      return response
    })(),
  )
})
