/**
 * Outbox Queue — Background Sync System
 *
 * Philosophy:
 * 1. Write to IndexedDB immediately (no blocking UI)
 * 2. Flush in background (online, visibilitychange, periodic)
 * 3. Deduplication prevents duplicate submissions
 * 4. Exponential backoff on failures
 * 5. Auto-retry with persistence
 *
 * Usage:
 *   import { addToOutbox, getOutboxPending, flushOutbox } from '../lib/outbox';
 *
 *   // When user performs an action:
 *   await addToOutbox('exam_submit', { examId, score, answers }, `user:${userId}:exam:${examId}`);
 *
 *   // Periodic flush (call in useEffect or service worker)
 *   // const pending = await getOutboxPending();
 *   // await flushOutbox(pending);
 */

import { openDB, IDBPDatabase } from 'idb';
import { getDB } from './idb';

const CHANNEL_NAME = 'drcode-outbox-flush';
let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return broadcastChannel;
}

/** Types of outbox items */
export type OutboxType =
  | 'video_progress'
  | 'exam_submit'
  | 'code_save'
  | 'note_view'
  | 'bootstrap_update';

export interface OutboxItem {
  id: string;
  type: OutboxType;
  payload: unknown;
  createdAt: number;
  retries: number;
  dedupeKey?: string;
}

/** Flush a single item to the API */
async function flushItem(item: OutboxItem): Promise<boolean> {
  const { type, payload, dedupeKey } = item;

  // Build the API route based on type
  const routes: Record<OutboxType, string> = {
    video_progress: '/api/video-progress',
    exam_submit: '/api/exam-results',
    code_save: '/api/code-files',
    note_view: '/api/notes',
    bootstrap_update: '/api/bootstrap',
  };

  const route = routes[type];
  if (!route) {
    console.error('[outbox] Unknown type:', type);
    return false;
  }

  try {
    // Add dedupe header if key provided
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(dedupeKey ? { 'X-Dedupe-Key': dedupeKey } : {}),
    };

    const res = await fetch(route, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      // Keep alive for slow networks
      keepalive: true,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      console.warn(`[outbox] ${type} failed (${res.status}):`, errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[outbox] Network error:', err);
    return false;
  }
}

/** Flush all pending items */
export async function flushOutbox(
  items: OutboxItem[] = [],
  maxConcurrent = 3
): Promise<{ succeeded: number; failed: number }> {
  const db = await getDB();
  const pending = items.length
    ? items
    : await getOutboxPending();

  if (!pending.length) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  let i = 0;

  // Flush with concurrency limit
  const flushNext = async () => {
    if (i >= pending.length) return;

    const item = pending[i];
    const success = await flushItem(item);

    if (success) {
      // Remove from IndexedDB
      await removeFromOutbox(item.id);
      succeeded++;
    } else {
      // Increment retry count
      await incrementOutboxRetry(item.id);
      failed++;
    }

    i++;
    if (i < pending.length) {
      // Throttle: wait a bit before next request
      setTimeout(flushNext, 200);
    }
  };

  // Start flushing
  flushNext();

  // Also broadcast to other tabs that sync is in progress
  const channel = getBroadcastChannel();
  if (channel) {
    channel.postMessage({
      type: 'outbox-flush-started',
      timestamp: Date.now(),
    });
  }

  return { succeeded, failed };
}

/** Add item to outbox (idempotent with dedupe) */
export async function addToOutbox(
  type: OutboxType,
  payload: unknown,
  dedupeKey?: string
): Promise<string> {
  const db = await getDB();

  // Check for existing pending item with same dedupeKey
  if (dedupeKey) {
    const existing = await getOutboxPending(type);
    const existingItem = existing.find((i) => i.dedupeKey === dedupeKey);
    if (existingItem) {
      // Optionally: update retry count or just return existing id
      return existingItem.id;
    }
  }

  // Create new item
  const id = crypto.randomUUID();
  const item: OutboxItem = {
    id,
    type,
    payload,
    createdAt: Date.now(),
    retries: 0,
    dedupeKey,
  };

  await db.put('outbox', item, id);
  return id;
}

/** Get all pending items (optionally filtered by type) */
export async function getOutboxPending(
  type?: OutboxType
): Promise<OutboxItem[]> {
  const db = await getDB();
  const tx = db.transaction('outbox', 'readonly');
  const store = tx.objectStore('outbox');
  const index = type ? index.openKeyCursor(type) : store.openCursor();
  const results: OutboxItem[] = [];

  return new Promise((resolve) => {
    cursor.onsuccess = (event) => {
      const cursor = event.target?.result;
      if (cursor) {
        results.push(cursor.value as OutboxItem);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    cursor.onerror = () => resolve(results);
  });
}

/** Remove a specific item from outbox */
export async function removeFromOutbox(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('outbox', id);
}

/** Increment retry counter for a failed item */
export async function incrementOutboxRetry(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('outbox', id);
  if (existing) {
    await db.put(
      { ...existing, retries: (existing.retries ?? 0) + 1 },
      'outbox',
      id
    );
  }
}

/** Flush when coming back online */
export function setupOnlineListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  const channel = getBroadcastChannel();

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'online-resume') {
      // Other tab flushed — we should too
      flushOutbox().then(() => {
        channel?.postMessage({ type: 'outbox-flushed', timestamp: Date.now() });
      });
    }
  };

  channel?.addEventListener('message', handler);

  // Also listen for browser online event
  const onlineHandler = () => {
    channel?.postMessage({ type: 'online-resume' });
  };
  window.addEventListener('online', onlineHandler);

  // Return cleanup function
  return () => {
    channel?.removeEventListener('message', handler);
    window.removeEventListener('online', onlineHandler);
  };
}

/** Periodic flush — call this in a useEffect or service worker */
export async function periodicFlush(intervalMs = 30_000): Promise<void> {
  const items = await getOutboxPending();
  if (items.length > 0) {
    await flushOutbox(items);
  }

  // Schedule next run
  setTimeout(periodicFlush, intervalMs);
}

/** Initialize the outbox system */
export function initOutbox(): () => void {
  // Listen for online events to trigger flush
  setupOnlineListener();

  // Initial flush on startup (short delay to let DB settle)
  setTimeout(() => {
    flushOutbox().then(() => {
      const channel = getBroadcastChannel();
      if (channel) {
        channel.postMessage({
          type: 'outbox-initialized',
          timestamp: Date.now(),
        });
      }
    });
  }, 1000);

  // Return cleanup
  return () => {
    // Cleanup handled by setupOnlineListener
  };
}