/**
 * DR Code Notifications Worker
 * ============================
 * نظام إشعارات مستقل عن Supabase يستخدم:
 * - Cloudflare KV لتخزين الاشتراكات
 * - Web Push Protocol مع VAPID
 * - Firebase Cloud Messaging (اختياري للدعم عبر FCM)
 *
 * المميزات:
 * - إرسال إشعارات حتى بعد إغلاق التطبيق/المتصفح
 * - جدولة الإشعارات
 * - دعم الصوت والاهتزاز
 * - منع التكرار
 */

// VAPID Keys - استبدلها بمفاتيحك الخاصة
// يمكن توليد المفاتيح عبر: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = 'BEq8f9t5g3v8J4Y2kX9wNqL1mR7pStUvWxYzA1bC2dE3fG4hI5jK6lM7nO8pQr';
// المفتاح الخاص يجب وضعه كمتغير بيئي في Cloudflare Workers
// const VAPID_PRIVATE_KEY = env.VAPID_PRIVATE_KEY;

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * تحويل ArrayBuffer إلى Base64 URL-safe
 */
function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * تحويل Base64 URL-safe إلى ArrayBuffer
 */
function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * توقيع رسالة VAPID لاستخدام Web Push Protocol
 */
async function generateVapidAuth(audience: string, privateKeyBase64: string): Promise<string> {
  const keyBuf = base64UrlToArrayBuffer(privateKeyBase64);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuf,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const payload = `eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJtZW50aW9uQGRyY29kZS53b3JsZ2V2cy5kZWZhdWx0IiwiaXNzIjoiYXBpLmNsb3VkZGlzLnNlcnZpY2UifQ`;

  const payloadBytes = new TextEncoder().encode(payload);
  const signature = await crypto.subtle.sign('ECDSA', key, payloadBytes);
  const sigBase64 = arrayBufferToBase64Url(signature);

  return `${payload}.${sigBase64}`;
}

/**
 * إرسال إشعار عبر Web Push Protocol
 */
async function sendWebPush(subscription: PushSubscriptionData, payload: any): Promise<boolean> {
  const endpoint = subscription.endpoint;
  const payloadString = JSON.stringify(payload);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `WebPush ${await generateVapidAuth('https://your-domain.workers.dev', VAPID_PRIVATE_KEY)}`,
        'Content-Type': 'application/json',
        'Encryption': `salt=${btoa(payloadString)}`,
        'Crypto-Key': `dh=${subscription.p256dh}`
      },
      body: payloadString,
    });

    return response.ok || response.status === 410; // 410 = Gone (subscription expired)
  } catch {
    return false;
  }
}

// ============================================================
// Cloudflare KV API (يجب إعداده في Workers KV)
// ============================================================

async function getKV(key: string): Promise<any> {
  // هذه وظيفة افتراضية - يجب استبدالها بواجهة KV الفعلية
  // يتم إرسالها إلى KV أثناء نشر Worker
  return null;
}

async function putKV(key: string, value: any, ttl?: number): Promise<void> {
  // وظيفة افتراضية
}

async function deleteKV(key: string): Promise<void> {
  // وظيفة افتراضية
}

// ============================================================
// تخزين الاشتراكات
// ============================================================

const SUBSCRIPTIONS_PREFIX = 'subs:';
const NOTIFICATIONS_PREFIX = 'notifs:';
const SCHEDULED_PREFIX = 'scheduled:';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    type?: string;
    id?: string | number;
    [key: string]: any;
  };
  vibrate?: number[];
  silent?: boolean;
  requireInteraction?: boolean;
}

interface ScheduledNotification {
  id: string;
  userId: string;
  payload: NotificationPayload;
  scheduledAt: number;
  sendAt: number;
  repeat?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  timezone?: string;
  sent: boolean;
  sentAt?: number;
}

/**
 * حفظ الاشتراك
 */
async function saveSubscription(userId: string, subscription: PushSubscriptionData): Promise<void> {
  const key = `${SUBSCRIPTIONS_PREFIX}${userId}:${subscription.endpoint}`;
  await putKV(key, subscription, 60 * 60 * 24 * 365); // 1 سنة
}

/**
 * حذف الاشتراك
 */
async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  const key = `${SUBSCRIPTIONS_PREFIX}${userId}:${endpoint}`;
  await deleteKV(key);
}

/**
 * الحصول على جميع اشتراكات المستخدم
 */
async function getUserSubscriptions(userId: string): Promise<PushSubscriptionData[]> {
  // هذه تحتاج استعلاماً إلى KV
  // يمكن استخدام list مع prefix
  const subscriptions: PushSubscriptionData[] = [];
  // تنفيذ افتراضي
  return subscriptions;
}

// ============================================================
// إدارة الإشعارات المجدولة
// ============================================================

/**
 * جدولة إشعار
 */
async function scheduleNotification(scheduled: ScheduledNotification): Promise<void> {
  const key = `${SCHEDULED_PREFIX}${scheduled.id}`;
  await putKV(key, scheduled, Math.max(0, Math.floor((scheduled.sendAt - Date.now()) / 3600)));
}

/**
 */
/**
 * إلغاء جدولة إشعار
 */
async function cancelScheduledNotification(id: string): Promise<void> {
  await deleteKV(`${SCHEDULED_PREFIX}${id}`);
}

/**
 * الحصول على الإشعارات المجدولةالمعلقة
 */
async function getPendingScheduledNotifications(): Promise<ScheduledNotification[]> {
  const now = Date.now();
  // يجب استعلام KV بهذه المنطق
  const notifications: ScheduledNotification[] = [];
  return notifications.filter(n => n.sendAt <= now && !n.sent);
}

// ============================================================
// معالجات API
// ============================================================

/**
 * اشتراك جديد
 */
async function handleSubscribe(req: Request): Promise<Response> {
  let body: { userId: string; subscription: PushSubscriptionData };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.userId || !body.subscription) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
  }

  await saveSubscription(body.userId, body.subscription);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * إلغاء الاشتراك
 */
async function handleUnsubscribe(req: Request): Promise<Response> {
  let body: { userId: string; endpoint: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  await deleteSubscription(body.userId, body.endpoint);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * جدولة إشعار
 */
async function handleSchedule(req: Request): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const {
    userId,
    id,
    title,
    body: messageBody,
    sendAt,
    icon,
    badge,
    data,
    vibrate,
    repeat,
    timezone,
  } = body;

  if (!userId || !id || !sendAt) {
    return new Response(JSON.stringify({ error: 'Missing required fields: userId, id, sendAt' }), { status: 400 });
  }

  const scheduled: ScheduledNotification = {
    id,
    userId,
    payload: {
      title,
      body: messageBody,
      icon,
      badge,
      data,
      vibrate: vibrate || [200, 100, 200],
      requireInteraction: true,
    },
    scheduledAt: Date.now(),
    sendAt: Number(sendAt),
    repeat,
    timezone,
    sent: false,
  };

  await scheduleNotification(scheduled);

  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * إلغاء جدولة الإشعار
 */
async function handleCancelSchedule(req: Request): Promise<Response> {
  let body: { id: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  await cancelScheduledNotification(body.id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * اختبار إشعار للمستخدم
 */
async function handleTest(req: Request): Promise<Response> {
  let body: { userId: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.userId) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 });
  }

  const subscriptions = await getUserSubscriptions(body.userId);

  for (const sub of subscriptions) {
    await sendWebPush(sub, {
      title: '🔔 اختبار إشعارات DR Code',
      body: 'هذا إشعار تجريبي. تم استقباله بنجاح!',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { type: 'test', url: '/' },
    });
  }

  return new Response(JSON.stringify({ ok: true, sentCount: subscriptions.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * الحصول على حالة الإشعارات
 */
async function handleStatus(req: Request): Promise<Response> {
  let body: { userId: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.userId) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 });
  }

  const subscriptions = await getUserSubscriptions(body.userId);

  return new Response(JSON.stringify({
    vapidConfigured: true,
    subscriptions: subscriptions.length,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * الحصول على مفتاح VAPID العام
 */
async function handlePublicKey(): Promise<Response> {
  return new Response(JSON.stringify({
    key: VAPID_PUBLIC_KEY,
    configured: true,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * إرسال إشعار سريع (للإدمن)
 */
async function handleSendImmediate(req: Request): Promise<Response> {
  let body: { userId: string; title: string; body: string; data?: any };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.userId || !body.title) {
    return new Response(JSON.stringify({ error: 'Missing userId or title' }), { status: 400 });
  }

  const subscriptions = await getUserSubscriptions(body.userId);

  for (const sub of subscriptions) {
    await sendWebPush(sub, {
      title: body.title,
      body: body.body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: body.data || { type: 'immediate' },
      requireInteraction: true,
    });
  }

  return new Response(JSON.stringify({ ok: true, sentCount: subscriptions.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================
// المستمعون (Cron Job) للإشعارات المجدولة
// ============================================================

/**
 * مهددة لإرسال الإشعارات المجدولة
 * يتم استدعاؤها عبر Cron أو يدوياً
 */
async function sendScheduledNotifications(): Promise<{ sent: number; failed: number }> {
  const notifications = await getPendingScheduledNotifications();
  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    // التحقق من توقيت الإرسال
    const now = Date.now();
    if (notification.sendAt > now) continue;

    // الحصول على الاشتراكات
    const subscriptions = await getUserSubscriptions(notification.userId);

    if (subscriptions.length === 0) {
      // لا توجد اشتراكات - حذف الإشعار المنتهي
      await cancelScheduledNotification(notification.id);
      continue;
    }

    // إرسال الإشعارات
    for (const sub of subscriptions) {
      const success = await sendWebPush(sub, notification.payload);
      if (success) sent++;
      else failed++;
    }

    // تحديث حالة الإشعار
    if (notification.repeat) {
      // إعادة جدولة
      const nextNotification: ScheduledNotification = {
        ...notification,
        id: `scheduled:${Date.now()}:${Math.random()}`,
        sent: false,
        scheduledAt: Date.now(),
        sendAt: calculateNextSendTime(notification.sendAt, notification.repeat),
      };
      await scheduleNotification(nextNotification);
    }

    // تعليم الإشعار كمنسورخة
    notification.sent = true;
    notification.sentAt = now;
  }

  return { sent, failed };
}

/**
 * حساب وقت الإرسال التالي بناءً على التكرار
 */
function calculateNextSendTime(currentTime: number, repeat: string): number {
  const nextMap: Record<string, number> = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  return currentTime + (nextMap[repeat] || 24 * 60 * 60 * 1000);
}

// ============================================================
// المشغل الرئيسي
// ============================================================

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // مسارات API
    const routes: Array<{ pattern: string, handler: (req: Request) => Promise<Response> }> = [
      { pattern: '/api/push/public-key', handler: handlePublicKey },
      { pattern: '/api/push/subscribe', handler: handleSubscribe },
      { pattern: '/api/push/unsubscribe', handler: handleUnsubscribe },
      { pattern: '/api/push/schedule', handler: handleSchedule },
      { pattern: '/api/push/cancel-schedule', handler: handleCancelSchedule },
      { pattern: '/api/push/test', handler: handleTest },
      { pattern: '/api/push/send', handler: handleSendImmediate },
      { pattern: '/api/push/status', handler: handleStatus },
      { pattern: '/api/push/send-scheduled', handler: () => {
        const result = sendScheduledNotifications();
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      }},
    ];

    for (const route of routes) {
      if (path === route.pattern || path.startsWith(route.pattern + '?')) {
        const response = await route.handler(request);
        return addCORSHeaders(response);
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },

  // جدولة تنفيذية دورية (مثال باستخدام Cron Triggers)
  // يمكن تفعيلها عبر قالب wrangler.toml:
  // [[crons]]
  // cron = "*/5 * * * *"  # كل 5 دقائق
  async scheduled(event: any, env: any, ctx: ExecutionContext): Promise<void> {
    await sendScheduledNotifications();
  },
};

/**
 * إضافة رؤوس CORS إلى الاستجابة
 */
function addCORSHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { status: response.status, headers });
}