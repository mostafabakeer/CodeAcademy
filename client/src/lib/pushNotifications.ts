import { api } from '../api/client';

/** المفتاح قد يُحقن وقت البناء (تحسين)، وإلا نجلبه من الخادم وقت التشغيل. */
const BUILD_VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';
let runtimeVapidKey: string | null = null;

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushType = 'lesson' | 'exam' | 'note' | 'test' | 'reset' | 'student';

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    type?: PushType;
    id?: number;
  };
}

/**
 * Convert base64 string to Uint8Array for Web Push
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * المفتاح العام لـ Web Push.
 *
 * لا نعتمد على `VITE_VAPID_PUBLIC_KEY` وحده: لو نُسي عند البناء يفشل الاشتراك
 * بصمت ولا يصل أي إشعار — وهي المشكلة التي جعلت الإشعارات لا تعمل. الخادم
 * يعرض المفتاح على `/push/public-key` وقت التشغيل، فنظل يعملون في كل الحالات.
 */
export async function getVapidPublicKey(): Promise<string> {
  if (BUILD_VAPID_PUBLIC_KEY) return BUILD_VAPID_PUBLIC_KEY;
  if (runtimeVapidKey !== null) return runtimeVapidKey;
  try {
    const res = await api<{ key?: string; configured?: boolean }>('/push/public-key');
    runtimeVapidKey = res?.key ?? '';
  } catch {
    runtimeVapidKey = '';
  }
  return runtimeVapidKey;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** هل نحن على iOS/iPadOS؟ (إشعارات الويب لا تعمل إلا بعد تثبيت PWA). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ يقدّم نفسه كـ Macintosh — نتحقق من اللمس أيضاً.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** هل الموقع مفتوح كتطبيق مثبّت على الشاشة الرئيسية؟ */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || iosStandalone === true;
}

/**
 * Get current push subscription from service worker
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function subscriptionToData(sub: PushSubscription): PushSubscriptionData {
  const p256dh = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  if (!p256dh || !auth) throw new Error('Push subscription keys missing');
  return {
    endpoint: sub.endpoint,
    p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
    auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
  };
}

/** حفظ الاشتراك في الخادم — upsert بالـ endpoint، فتكراره آمن. */
async function saveSubscription(sub: PushSubscription): Promise<PushSubscriptionData> {
  const data = subscriptionToData(sub);
  await api('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return data;
}

/** هل الاشتراك الحالي مشترك بنفس مفتاح VAPID؟ (تغيير المفتاح يوجب إعادة الاشتراك). */
function usesSameKey(sub: PushSubscription, vapidKey: string): boolean {
  const raw = sub.options?.applicationServerKey;
  if (!raw) return true;
  const current = new Uint8Array(raw as ArrayBuffer);
  const wanted = urlBase64ToUint8Array(vapidKey);
  if (current.length !== wanted.length) return false;
  for (let i = 0; i < current.length; i++) {
    if (current[i] !== wanted[i]) return false;
  }
  return true;
}

/** يضمن وجود اشتراك صالح للجهاز ويعيده (بدون طلب إذن). */
async function getOrCreateSubscription(vapidKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (subscription && !usesSameKey(subscription, vapidKey)) {
    // مفتاح الخادم تغيّر ⇒ الاشتراك القديم لا يصلح.
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  return subscription;
}

/**
 * Subscribe user to push notifications (يطلب الإذن عند الحاجة).
 */
export async function subscribeToPush(): Promise<PushSubscriptionData | null> {
  if (!isPushSupported()) {
    throw new Error('Push notifications not supported');
  }

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    throw new Error('VAPID public key not configured');
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  try {
    const subscription = await getOrCreateSubscription(vapidKey);
    return await saveSubscription(subscription);
  } catch (error) {
    console.error('Push subscription failed:', error);
    throw error;
  }
}

/**
 * مزامنة صامتة عند كل إقلاع.
 *
 * الإذن الممنوح لا يكفي: المتصفح قد يجدد الـ endpoint أو يلغيه، فيصبح الاشتراك
 * المحفوظ على الخادم ميتاً وتتوقف الإشعارات بصمت (خصوصاً والموقع مغلق). هنا:
 *  - لو الإذن ممنوح ⇒ ننشئ/نستعيد الاشتراك ونرفعه للخادم (upsert).
 *  - لو لم يُمنح ⇒ لا نفعل شيئاً ولا نزعج المستخدم بأي نافذة إذن.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return false;
    const subscription = await getOrCreateSubscription(vapidKey);
    await saveSubscription(subscription);
    return true;
  } catch (error) {
    console.warn('[push] background sync skipped:', error);
    return false;
  }
}

/**
 * Unsubscribe user from push notifications
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();

      // Notify backend
      await api('/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
  } catch (error) {
    console.error('Push unsubscription failed:', error);
    throw error;
  }
}

/**
 * Check if user is subscribed to push notifications
 */
export async function isSubscribedToPush(): Promise<boolean> {
  const subscription = await getPushSubscription();
  return !!subscription;
}

export interface PushStatus {
  vapidConfigured: boolean;
  subscriptions: number;
}

/** حالة الإشعارات على الخادم لهذا الحساب (تشخيص سبب عدم وصول الإشعارات). */
export async function getPushStatus(): Promise<PushStatus | null> {
  try {
    return await api<PushStatus>('/push/status');
  } catch {
    return null;
  }
}

/**
 * Send test push notification (local fallback to ensure it works)
 */
export async function sendTestPush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('يجب السماح بالإشعارات من إعدادات المتصفح');
    return;
  }

  // Local notification for testing
  new Notification('اختبار إشعارات DR Code', {
    body: 'هذا إشعار تجريبي للتأكد من عمل التنبيهات والصوت.',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
  });

  // Call API for server-side push as well
  await api('/push/test', { method: 'POST' }).catch(() => {
    console.warn('API test push failed (ok if no server-side push configured)');
  });
}
