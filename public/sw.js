// Kross Service Worker — PWA + Push

const CACHE_NAME = 'kross-v3'
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

// Push: show notification
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const { title, body, url, tag, type } = data

  const isCall = type === 'call'

  const options = {
    body: body || 'Tienes una novedad',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: tag || 'kross',
    data: { url: url || '/' },
    vibrate: isCall ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    requireInteraction: isCall, // call stays until dismissed
    silent: false,
    actions: isCall
      ? [{ action: 'open', title: '📞 Abrir app' }]
      : [],
  }

  event.waitUntil(
    self.registration.showNotification(title || 'Kross 📦', options)
  )
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
