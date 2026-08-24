/**
 * Service worker registration.
 *
 * Only in production builds: a worker in front of the dev server would serve stale modules and
 * fight hot reload, and the offline cache is meaningless when the server is on localhost anyway.
 *
 * The URL is built from `import.meta.env.BASE_URL` so the worker's scope is the app's own path.
 * Registered from the site root, a Pages project site's worker would be out of scope and rejected.
 */

import { platform } from '@platform'

export function registerServiceWorker(): void {
  // The plugin reads its assets straight out of the binary, so a cache in front of them buys
  // nothing and risks serving a stale panel after an update.
  if (platform.name !== 'web') return
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    void navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch(() => {
      // An unregistrable worker costs offline support, nothing more; the app still runs.
    })
  })
}
