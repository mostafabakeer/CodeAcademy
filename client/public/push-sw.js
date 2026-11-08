/* eslint-disable no-restricted-globals */
/**
 * معالج Web Push — يُستورد داخل service worker المولَّد (workbox importScripts).
 *
 * لماذا ملف منفصل؟ لأن VitePWA في وضع generateSW يولّد sw.js تلقائياً ولا يسمح
 * بإضافة أحداث push مباشرة. `importScripts` يحقن هذا الملف داخل الـ SW الناتج
 * فيعمل الإشعار حتى لو كان التاب مغلقاً.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : '' };
    } catch {
      payload = {};
    }
  }

  const data = payload.data || {};
  const title = payload.title || 'DR Code';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192.png',
    badge: payload.badge || '/pwa-192.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [80, 40, 80],
    data,
    // إشعار واحد لكل عنصر: إشعار جديد يستبدل القديم بدل تكديسه.
    tag: data.type ? `${data.type}-${data.id || ''}` : undefined,
    renotify: true,
  };

  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, options);
      } catch {
        /* بعض المتصفحات ترفض renotify/tag — نعيد المحاولة بالحد الأدنى */
        await self.registration.showNotification(title, { body: options.body, data });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        try {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        } catch {
          /* جرّب نافذة أخرى */
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })(),
  );
});
