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

/**
 * المتصفح يجدّد اشتراك الـ push من تلقاء نفسه أحياناً (تحديث مفاتيح/إعادة تثبيت).
 * بدون هذا المعالج يبقى الخادم يحتفظ بالـ endpoint القديم الميت، فلا يصل أي
 * إشعار — حتى لو كان كل شيء آخر سليماً. نعيد الاشتراك ونرفع الجديد للخادم.
 *
 * ملاحظة: الـ service worker لا يملك حالة تسجيل الدخول في الذاكرة، لكن طلب
 * fetch من نفس الأصل يرسل كوكي الجلسة HttpOnly تلقائياً مع credentials: include.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription;
        const applicationServerKey =
          (old && old.options && old.options.applicationServerKey) ||
          (event.newSubscription && event.newSubscription.options && event.newSubscription.options.applicationServerKey);

        let sub = event.newSubscription;
        if (!sub && applicationServerKey) {
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }
        if (!sub) return;

        const bufToBase64 = (buf) => {
          let binary = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          return btoa(binary);
        };

        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            p256dh: bufToBase64(sub.getKey('p256dh')),
            auth: bufToBase64(sub.getKey('auth')),
          }),
        });
      } catch (err) {
        // لا شيء نفعله هنا — المزامنة التالية عند فتح الموقع ستعيد المحاولة.
        console.warn('[push-sw] resubscribe failed', err);
      }
    })(),
  );
});
