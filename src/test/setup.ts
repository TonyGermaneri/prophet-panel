/**
 * Minimal localStorage for the Node test environment. The persistence layers already tolerate a
 * missing store, but bindings and settings tests need to assert that values actually survive, and
 * a stub is far cheaper than pulling in a full DOM.
 */
// Some runtimes expose a partial localStorage, so check for a usable one rather than any one.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, String(value)),
      removeItem: (key: string) => void data.delete(key),
      clear: () => data.clear(),
      key: (index: number) => [...data.keys()][index] ?? null,
      get length() {
        return data.size
      },
    },
  })
}
