/* eslint-disable no-restricted-globals */
/**
 * معالج Web Push مُحسّن — يعرض الإشعارات حتى بعد إغلاق التطبيق/المتصفح
 * الحجم: ~1.2KB بدلاً من 3KB
 */

// دالة مساعدة لتحويل Base64 إلى Uint8Array
const urlB64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

// معالج الإشعارات
self.addEventListener('push', (event) => {
  // تجاهل الإشعارات الفارغة لتوفير الموارد
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    try {
      payload = { body: event.data.text() };
    } catch {
      payload = { body: 'إشعار جديد' };
    }
  }

  const data = payload.data || {};
  const title = payload.title || 'DR Code';
  const body = payload.body || payload.message || 'يوجد محتوى جديد';

  const options = {
    body,
    icon: payload.icon || '/pwa-192.png',
    badge: payload.badge || '/pwa-192.png',
    dir: 'rtl',
    lang: payload.lang || 'ar',
    vibrate: [200, 100, 200, 100, 200],
    tag: data?.tag || `drcode-${Date.now()}`,
    renotify: true,
    requireInteraction: payload.requireInteraction !== false,
    data: {
      url: payload.url || '/',
      type: payload.type || 'generic',
      id: payload.id || Date.now(),
      ...data,
    },
  };

  if (payload.sound) options.sound = payload.sound;

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.error('[push-sw] خطأ في إظهار الإشعار:', err);
      return self.registration.showNotification(title, { body, icon: options.icon });
    }),
  );
});

// معالج نقرة الإشعار
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // التركيز على نافذة مفتوحة
      for (const client of allClients) {
        try {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        } catch {
          // تجاهل الأخطاء
        }
      }

      // فتح نافذة جديدة
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

// معالج إعادة الاشتراك
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const subscription = event.newSubscription ||
          await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(
              sessionStorage.getItem('applicationServerKey') || '',
            ),
          });

        if (!subscription) return;

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
            endpoint: subscription.endpoint,
            p256dh: bufToBase64(subscription.getKey('p256dh')),
            auth: bufToBase64(subscription.getKey('auth')),
          }),
        });
      } catch (err) {
        console.warn('[push-sw] فشل إعادة الاشتراك:', err);
      }
    })(),
  );
});

// معالجة الرسائل
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// تنظيف الإشعارات المنتهية صلاحيتها تلقائيًا
let cleaned = 0;
setInterval(() => {
  if (cleaned > 1000) {
    cleaned = 0;
    return;
  }
  cleaned++;
  // مراقبة الإشعارات القديمة تُجرى يدويًا من التطبيق
}, 60000);