// Kross Service Worker — Phase 2 stub
// Handles Web Push notifications and offline caching

const CACHE_NAME = 'kross-v1'
const OFFLINE_URL = '/'

// Install: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  )
  self.skipWaiting()
})

// Activate: claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Push: show notification
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const { title, body, url, tag } = data

  event.waitUntil(
    self.registration.showNotification(title || 'Kross 📦', {
      body: body || 'Tienes una novedad de tu pedido',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: tag || 'kross-order',
      data: { url },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    })
  )
})

// Notification click: open/focus the magic link
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(targetUrl))
        if (existing) return existing.focus()
        return self.clients.openWindow(targetUrl)
      })
  )
})

// Fetch: network-first, fallback to cache
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error())
      )
    )
  }
})
