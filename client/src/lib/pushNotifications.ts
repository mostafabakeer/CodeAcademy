import { api } from '../api/client';

const BUILD_VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';
let runtimeVapidKey: string | null = null;

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushType = 'lesson' | 'exam' | 'note' | 'test' | 'reset';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function getVapidPublicKey(): Promise<string> {
  if (BUILD_VAPID_PUBLIC_KEY) return BUILD_VAPID_PUBLIC_KEY;
  if (runtimeVapidKey !== null) return runtimeVapidKey;
  try {
    const res = await api<{ key?: string }>('/push/public-key');
    runtimeVapidKey = res?.key ?? '';
  } catch {
    runtimeVapidKey = '';
  }
  return runtimeVapidKey;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as any).standalone;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || iosStandalone === true;
}

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

async function saveSubscription(sub: PushSubscription): Promise<PushSubscriptionData> {
  const data = subscriptionToData(sub);
  await api('/push/subscribe', { method: 'POST', body: JSON.stringify(data) });
  return data;
}

function usesSameKey(sub: PushSubscription, vapidKey: string): boolean {
  const raw = sub.options?.applicationServerKey;
  if (!raw) return true;
  const current = new Uint8Array(raw as ArrayBuffer);
  const wanted = urlBase64ToUint8Array(vapidKey);
  if (current.length !== wanted.length) return false;
  for (let i = 0; i < current.length; i++) if (current[i] !== wanted[i]) return false;
  return true;
}

async function getOrCreateSubscription(vapidKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (subscription && !usesSameKey(subscription, vapidKey)) {
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

export async function subscribeToPush(): Promise<PushSubscriptionData | null> {
  if (!isPushSupported()) throw new Error('Push notifications not supported');

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) throw new Error('VAPID public key not configured');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission denied');

  try {
    const subscription = await getOrCreateSubscription(vapidKey);
    return await saveSubscription(subscription);
  } catch (error) {
    console.error('Push subscription failed:', error);
    throw error;
  }
}

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

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
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

export async function isSubscribedToPush(): Promise<boolean> {
  const subscription = await getPushSubscription();
  return !!subscription;
}

export interface PushStatus {
  vapidConfigured: boolean;
  subscriptions: number;
}

export async function getPushStatus(): Promise<PushStatus | null> {
  try {
    return await api<PushStatus>('/push/status');
  } catch {
    return null;
  }
}

export async function sendTestPush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('يجب السماح بالإشعارات من إعدادات المتصفح');
    return;
  }

  new Notification('🔔 اختبار إشعارات DR Code', {
    body: 'هذا إشعار تجريبي للتأكد من عمل التنبيهات والصوت.',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
  });

  await api('/push/test', { method: 'POST' }).catch(() => {});
}

// تصدير وظائف جدولة الإشعارات
export { scheduleNotification, cancelNotification, getScheduledNotifications, cleanupNotifications, getDueNotifications, generateNotificationId } from './notificationsSchedule';