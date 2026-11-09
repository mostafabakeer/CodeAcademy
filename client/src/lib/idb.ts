/**
 * IndexedDB Wrapper (idb v7)
 * --------------------------------
 * Stores (objectStore names):
 *   - bootstrap
 *   - exam_results
 *   - code_files
 *   - outbox
 *   - notes_cache
 *   - video_progress
 *   - settings
 */

import { openDB, type IDBPDatabase } from 'idb';

// DB name & version
const DB_NAME = 'drcode-v2';
const DB_VERSION = 2;

// Cache the database instance
let dbPromise: IDBPDatabase | null = null;

// Get the open database instance
export async function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('bootstrap')) db.createObjectStore('bootstrap');
        if (!db.objectStoreNames.contains('exam_results')) db.createObjectStore('exam_results');
        if (!db.objectStoreNames.contains('code_files')) db.createObjectStore('code_files');
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox');
        if (!db.objectStoreNames.contains('notes_cache')) db.createObjectStore('notes_cache');
        if (!db.objectStoreNames.contains('video_progress')) db.createObjectStore('video_progress');
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      },
    });
  }
  return dbPromise;
}

/** Close the database connection */
export async function closeDB(): Promise<void> {
  if (dbPromise) {
    dbPromise.close();
    dbPromise = null;
  }
}

/** Bootstrap (Cached Content Versioning) */
export async function saveBootstrap(
  userId: number,
  grade: string,
  contentHash: string,
  json: string
): Promise<void> {
  const db = await getDB();
  const key = `bootstrap:v${1}:${userId}`;
  await db.put('bootstrap', { userId, grade, contentHash, json, at: Date.now() }, key);
}

export async function getBootstrap(
  userId: number
): Promise<{ json: string; contentHash: string; at: number } | null> {
  const db = await getDB();
  const key = `bootstrap:v${1}:${userId}`;
  return await db.get('bootstrap', key);
}

export async function invalidateBootstrap(userId: number): Promise<void> {
  const db = await getDB();
  const key = `bootstrap:v${1}:${userId}`;
  await db.delete('bootstrap', key);
}

/** Exam Results */
export async function saveExamResult(
  userId: number,
  examResult: {
    examId: number;
    best: number;
    score: number;
    correct: number;
    total: number;
    attempts: number;
    answers: Record<string, number>;
    history: { at: number; score: number; correct: number; total: number }[];
  }
): Promise<void> {
  const db = await getDB();
  const key = `${userId}-${examResult.examId}`;
  await db.put('exam_results', { ...examResult, userId, at: Date.now() }, key);
}

export async function getExamResults(
  userId: number
): Promise<Map<number, { best: number; score: number; correct: number; total: number; attempts: number }>> {
  const db = await getDB();
  const all = await db.getAll('exam_results');
  const map = new Map();
  for (const r of all) {
    if (r.userId === userId) {
      map.set(r.examId, {
        best: r.best,
        score: r.score,
        correct: r.correct,
        total: r.total,
        attempts: r.attempts,
      });
    }
  }
  return map;
}

/** Code Files */
export async function saveCodeFile(
  file: {
    id: number;
    userId: number;
    name: string;
    language: string;
    code: string;
    versions: { at: number; code: string }[];
    createdAt: number;
    updatedAt: number;
  }
): Promise<void> {
  const db = await getDB();
  await db.put('code_files', file, file.id);
}

export async function getCodeFilesByUser(userId: number): Promise<{
  id: number;
  name: string;
  language: string;
  updatedAt: number;
}[]> {
  const db = await getDB();
  const all = await db.getAll('code_files');
  return all.filter((f: any) => f.userId === userId).map((f: any) => ({
    id: f.id,
    name: f.name,
    language: f.language,
    updatedAt: f.updatedAt,
  }));
}

/** Outbox Queue */
export async function addToOutbox(
  type: string,
  payload: unknown,
  dedupeKey?: string | null
): Promise<string> {
  const db = await getDB();

  // Check for existing pending item
  if (dedupeKey) {
    const pending = await getOutboxPending();
    const existingItem = pending.find((i: any) => i.dedupeKey === dedupeKey);
    if (existingItem) {
      return existingItem.id;
    }
  }

  // Create new item
  const id = crypto.randomUUID();
  const item = {
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

export async function getOutboxPending(
  type?: string
): Promise<any[]> {
  const db = await getDB();
  const all = await db.getAll('outbox');
  return type ? all.filter((i) => i.type === type) : all;
}

export async function incrementOutboxRetry(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('outbox', id);
  if (existing) {
    await db.put(
      'outbox',
      { ...existing, retries: (existing.retries ?? 0) + 1 },
      id
    );
  }
}

export async function removeFromOutbox(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('outbox', id);
}

/** Notes Cache */
export async function saveNoteCache(note: any): Promise<void> {
  const db = await getDB();
  await db.put('notes_cache', note, note.id);
}

export async function getNoteCache(noteId: number): Promise<any> {
  const db = await getDB();
  return db.get('notes_cache', noteId);
}

/** Video Progress */
export async function saveVideoProgress(
  lessonId: number,
  seconds: number,
  duration: number
): Promise<void> {
  const db = await getDB();
  await db.put(
    'video_progress',
    { lessonId, seconds, duration, updatedAt: Date.now() },
    `${lessonId}`
  );
}

export async function getVideoProgress(lessonId: number): Promise<{
  seconds: number;
  duration: number;
} | null> {
  const db = await getDB();
  return db.get('video_progress', `${lessonId}`);
}

/** Settings */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key, value, updatedAt: Date.now() }, key);
}

export async function getSetting(key: string): Promise<unknown> {
  const db = await getDB();
  return db.get('settings', key);
}

/** Migration Helper */
export async function migrateFromLocalStorage(): Promise<void> {
  console.log('[idb] Migration from localStorage — not implemented (data preserved in LS)');
}