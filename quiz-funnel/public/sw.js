// Service worker mínimo para Web Push + PWA instalable.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* noop */ }
  const title = data.title || 'Tu plan está listo'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Toca para verlo.',
    icon: data.icon || '/icon.png',
    badge: data.badge || '/icon.png',
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/'))
})
