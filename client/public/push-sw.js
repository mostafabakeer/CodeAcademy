/* eslint-disable no-restricted-globals */
/**
 * معالج Web Push — يعرض الإشعارات حتى بعد إغلاق التطبيق/المتصفح.
 *
 * ملاحظات مهمة عن الصوت:
 * - خاصية `sound` غير مدعومة على كروم/أندرويد (تُتجاهل) وعلى iOS يتحكم
 *   النظام بالصوت. لذلك نرسل أيضاً رسالة للنوافذ المفتوحة كي تشغّل الواجهة
 *   نغمتها بنفسها عبر Web Audio (وهذا هو المسار الذي يعمل فعلاً).
 * - لا نجبر `requireInteraction` (كان يبقي الإشعار عالقاً على الشاشة دائماً)،
 *   ولا نغيّر الـ tag لكل إشعار حتى تعمل إعادة التنبيه بشكل صحيح.
 */

/**
 * توافق خلفي لمحرك Python.
 *
 * الحزم القديمة تطلب `/pyodide/<version>/*`، وقد خزّن المتصفح ردود 404 لهذا
 * المسار سنة كاملة (immutable) وقت أن كان المجلد مفقوداً من النشر. إعادة
 * التوجيه هنا تحدث **قبل** الرجوع لكاش المتصفح، فتُلغي أثر تلك الردود العالقة
 * ويبدأ Python بالعمل دون أن يمسح الطالب بيانات الموقع.
 *
 * ملاحظة: لا نُعيد `respondWith` لأي مسار آخر حتى لا نتعارض مع Workbox.
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/pyodide/')) return;

  const target = new URL(self.location.origin);
  target.pathname = `/py-engine/${url.pathname.slice('/pyodide/'.length)}`;
  target.search = url.search;

  event.respondWith(
    fetch(target.toString(), { credentials: 'same-origin' }).catch(() =>
      fetch(event.request),
    ),
  );
});


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
  const type = payload.type || data.type || 'generic';
  // tag ثابت لكل نوع: يسمح باستبدال الإشعار القديم بدل تكديس عشرات الإشعارات.
  const tag = payload.tag || `drcode-${type}`;

  const options = {
    body,
    icon: payload.icon || '/pwa-192.png',
    badge: payload.badge || '/pwa-192.png',
    dir: 'rtl',
    lang: payload.lang || 'ar',
    vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [200, 100, 200],
    tag,
    renotify: payload.renotify !== false,
    // افتراضياً لا نُبقي الإشعار على الشاشة (كان true دائماً).
    requireInteraction: payload.requireInteraction === true,
    silent: payload.silent === true,
    data: {
      url: payload.url || data.url || '/',
      type,
      id: payload.id || data.id || Date.now(),
      ...data,
    },
  };

  // يظل يُمرَّر للأجهزة/المتصفحات التي تدعمه (لا يضرّ حين يُتجاهل).
  if (payload.sound) options.sound = payload.sound;

  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, options);
      } catch (err) {
        console.error('[push-sw] خطأ في إظهار الإشعار:', err);
        try {
          await self.registration.showNotification(title, {
            body,
            icon: options.icon,
            tag,
          });
        } catch {
          /* لا شيء آخر يمكن فعله */
        }
      }

      // إبلاغ النوافذ المفتوحة: تشغيل الصوت داخل التطبيق (المسار الموثوق).
      try {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        clients.forEach((client) => {
          client.postMessage({
            type: 'push-received',
            payload: { title, body, type, data: options.data },
          });
        });
      } catch {
        /* ignore */
      }
    })(),
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
        // ملاحظة: sessionStorage غير متاح داخل Service Worker، وكان الكود
        // القديم يعتمد عليه فيحصل على مفتاح فارغ ويفشل الاشتراك دائماً.
        let publicKey = '';
        try {
          const res = await fetch('/api/push/public-key', { cache: 'no-store' });
          const json = await res.json();
          publicKey = json?.key || '';
        } catch {
          publicKey = '';
        }

        const subscription =
          event.newSubscription ||
          (publicKey
            ? await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(publicKey),
              })
            : null);

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
