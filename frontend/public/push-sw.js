// Loaded into the generated service worker (workbox.importScripts in vite.config.ts): it shows the
// "Descanso terminado" notification the API sends, and a tap on it brings the workout back.

self.addEventListener('push', (event) => {
  const message = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(message.title || 'Gym Tracker', {
      body: message.body,
      icon: '/icon-192.png',
      // One notification per rest: a newer one replaces the last instead of piling up.
      tag: 'rest',
      data: { url: message.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data.url
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // The app is usually still open on the workout, with the draft in place: just bring it forward.
      const open = windows.find((client) => 'focus' in client)
      return open ? open.focus() : self.clients.openWindow(url)
    }),
  )
})
