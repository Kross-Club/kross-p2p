// Los tests corren en Node, que no trae localStorage. La persistencia del
// checkout se prueba contra este stub en memoria — es más liviano que sumar
// jsdom como dependencia solo para un Storage.

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()

  const memoryStorage: Storage = {
    get length() { return store.size },
    key: index => [...store.keys()][index] ?? null,
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => { store.delete(key) },
    clear: () => { store.clear() },
  }

  // `Object.keys(localStorage)` se usa en purgeExpiredDrafts, así que el stub
  // tiene que exponer las claves como propiedades enumerables, igual que el real.
  globalThis.localStorage = new Proxy(memoryStorage, {
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: (_t, prop) =>
      typeof prop === 'string' && store.has(prop)
        ? { value: store.get(prop), enumerable: true, configurable: true }
        : undefined,
    get: (target, prop) =>
      typeof prop === 'string' && !(prop in target) ? store.get(prop) : Reflect.get(target, prop),
  })
}
