/**
 * إدارة جدولة الإشعارات محليًا عبر IndexedDB
 * دعم: الجدولة، التكرار، الإلغاء، منع التكرار
 */

import { openDB } from 'idb';

interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  scheduledAt: number;
  delivered: boolean;
  repeat?: 'daily' | 'weekly' | 'monthly';
  data?: Record<string, unknown>;
}

interface NotificationHistory {
  id: string;
  notificationId: string;
  deliveredAt: number;
  success: boolean;
}

const DB_NAME = 'drcode-notifications';
const DB_VERSION = 1;
let dbReady: Promise<ReturnType<typeof openDB>> | null = null;

function getDB() {
  if (!dbReady) {
    dbReady = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const scheduled = db.createObjectStore('scheduled', { keyPath: 'id' });
        scheduled.createIndex('delivered', 'delivered');

        const history = db.createObjectStore('history', { keyPath: 'id' });
        history.createIndex('by-date', 'deliveredAt');
      },
    });
  }
  return dbReady;
}

export async function scheduleNotification(notification: {
  id: string;
  title: string;
  body: string;
  scheduledAt: number;
  repeat?: 'daily' | 'weekly' | 'monthly';
  data?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDB();
  await db.put('scheduled', {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    scheduledAt: notification.scheduledAt,
    delivered: false,
    repeat: notification.repeat,
    data: notification.data,
  });
}

export async function cancelNotification(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('scheduled', id);
}

export async function getScheduledNotifications(): Promise<ScheduledNotification[]> {
  const db = await getDB();
  return db.getAll('scheduled');
}

export async function getDueNotifications(): Promise<ScheduledNotification[]> {
  const db = await getDB();
  const all = await db.getAll('scheduled');
  const now = Date.now();
  return all.filter((n) => !n.delivered && n.scheduledAt <= now);
}

/**
 * تنظيف الإشعارات المنتهية صلاحيتها (يتم استدعاؤه دوريًا)
 */
export async function cleanupNotifications(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('scheduled');
  const now = Date.now();
  let cleaned = 0;

  for (const n of all) {
    if (n.delivered && n.scheduledAt < now - 7 * 24 * 60 * 60 * 1000) {
      await db.delete('scheduled', n.id);
      cleaned++;
    }
  }

  return cleaned;
}

export async function markNotificationDelivered(
  id: string,
  success = true,
  notificationId?: string,
): Promise<void> {
  const db = await getDB();
  await db.add('history', {
    id: crypto.randomUUID(),
    notificationId: notificationId || id,
    deliveredAt: Date.now(),
    success,
  });
  await db.put('scheduled', { id, delivered: true, title: '', body: '', scheduledAt: Date.now(), data: {} });
}

export async function clearHistory(): Promise<void> {
  const db = await getDB();
  await db.clear('history');
}

export async function getNotificationHistory(limit = 50): Promise<NotificationHistory[]> {
  const db = await getDB();
  return db.getAllFromIndex('history', 'by-date').then((all) =>
    all.sort((a, b) => b.deliveredAt - a.deliveredAt).slice(0, limit),
  );
}

export function generateNotificationId(base: string): string {
  return `${base}-${Date.now()}`;
}

export { type ScheduledNotification, type NotificationHistory };