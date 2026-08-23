// Kross Service Worker — PWA + Push

const CACHE_NAME = 'kross-v7'
const OFFLINE_URL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Push: show notification (works in foreground, background and when closed)
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_e) {
    // Payload wasn't JSON — fall back to plain text
    try { data = { body: event.data.text() } } catch (_e2) { data = {} }
  }

  const { title, body, url, tag, type, icon, badge, image } = data
  const isCall = type === 'call'

  event.waitUntil((async () => {
    // Con la app ENFOCADA la notificación entra silenciosa y el sonido lo pone
    // la app: cada evento (nuevo cliente / nuevo mensaje) tiene el suyo. En
    // segundo plano o con la app cerrada suena el sistema, como siempre.
    let focused = []
    try {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      focused = wins.filter((c) => c.focused)
      for (const c of focused) c.postMessage({ kind: 'kross-push', type: type || 'message' })
    } catch (_e) { /* clients API falló — se notifica con sonido de sistema */ }

    const options = {
      body: body || 'Tienes una novedad',
      icon: icon || '/icon-192.png',   // large icon: seller photo or brand logo
      badge: badge || '/icon-192.png', // small monochrome icon: brand logo
      image: image || undefined,       // big preview (rich, IG-style) when provided
      tag: tag || 'kross',
      renotify: true, // buzz again even if a notification with the same tag exists
      data: { url: url || '/' },
      vibrate: isCall ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
      requireInteraction: isCall, // call stays until dismissed
      silent: focused.length > 0 && !isCall,
      actions: isCall ? [{ action: 'open', title: '📞 Abrir app' }] : [],
    }

    // MUST call showNotification for every push, otherwise Chrome/Android may
    // revoke the push subscription for "silent push" abuse.
    await self.registration.showNotification(title || 'Kross 📦', options)
  })())
})

// Notification click: open/focus the target URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab/window if already open
        for (const client of clients) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      })
  )
})

// Fetch: network-first, fallback to cache for navigation
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error())
      )
    )
  }
})
