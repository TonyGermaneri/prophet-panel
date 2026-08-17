/**
 * Service worker registration.
 *
 * Only in production builds: a worker in front of the dev server would serve stale modules and
 * fight hot reload, and the offline cache is meaningless when the server is on localhost anyway.
 *
 * The URL is built from `import.meta.env.BASE_URL` so the worker's scope is the app's own path.
 * Registered from the site root, a Pages project site's worker would be out of scope and rejected.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    void navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch(() => {
      // An unregistrable worker costs offline support, nothing more; the app still runs.
    })
  })
}
