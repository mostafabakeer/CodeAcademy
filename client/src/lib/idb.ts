/**
 * IndexedDB Wrapper (idb v7)
 * --------------------------------
 * Simple wrapper around the idb library (v7.1.1).
 * --------------------------------
 * Stores (objectStore names):
 *   - bootstrap: cached content per user/grade
 *   - exam_results: user exam results
 *   - code_files: user code files
 *   - outbox: background sync queue
 *   - notes_cache: notes PDF URLs cached
 *   - video_progress: video watch progress
 *   - settings: app settings
 */

// idb v7 exports openDB directly
import { openDB } from 'idb';

// DB name & version
const DB_NAME = 'drcode-v2';
const DB_VERSION = 2;

// Cache the database instance
let dbPromise: IDBPDatabase | null = null;

// Get the open database instance
export async function getDB(): Promise<IDBPDatabase> {
  if (!db) {
    db = await openDB(DB_NAME, DB_VERSION);
  }
  return db;
}

/** Close the database connection */
export async function closeDB(): Promise<void> {
  db = null;
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
  await db.put(DB_NAME, { userId, grade, contentHash, json, at: Date.now() }, key);
}

export async function getBootstrap(
  userId: number
): Promise<{ json: string; contentHash: string; at: number } | null> {
  const db = await getDB();
  const key = `bootstrap:v${1}:${userId}`;
  const data = await db.get(DB_NAME, key);
  if (!data) return null;
  return { json: data.json, contentHash: data.contentHash, at: data.at };
}

export async function invalidateBootstrap(userId: number): Promise<void> {
  const db = await getDB();
  const key = `bootstrap:v${1}:${userId}`;
  await db.delete(DB_NAME, key);
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
  await db.put(DB_NAME, { ...examResult, userId, at: Date.now() }, key);
}

export async function getExamResults(
  userId: number
): Promise<Map<number, { best: number; score: number; correct: number; total: number; attempts: number }>> {
  const db = await getDB();
  const tx = db.transaction(DB_NAME, 'readonly');
  const store = tx.objectStore(DB_NAME);
  const all = await store.getAll();
  const map = new Map<number, { best: number; score: number; correct: number; total: number; attempts: number }>();
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
  await db.put(DB_NAME, file);
}

export async function getCodeFilesByUser(userId: number): Promise<{
  id: number;
  name: string;
  language: string;
  updatedAt: number;
}[]> {
  const db = await getDB();
  const tx = db.transaction(DB_NAME, 'readonly');
  const store = tx.objectStore(DB_NAME);
  const all = await store.getAll();
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

  // Check for existing pending item with same dedupeKey
  if (dedupeKey) {
    const pending = await getOutboxPending(type);
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
  await db.put(DB_NAME, item, id);
  return id;
}

export async function getOutboxPending(
  type?: string
): Promise<any[]> {
  const db = await getDB();
  const tx = db.transaction(DB_NAME, 'readonly');
  const store = tx.objectStore(DB_NAME);
  const results: any[] = [];

  return new Promise((resolve) => {
    const request = store.openCursor();
    request.onsuccess = (event: any) => {
      const cursor = event.target?.result;
      if (cursor) {
        if (!type || cursor.value.type === type) {
          results.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => resolve(results);
  });
}

export async function incrementOutboxRetry(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get(DB_NAME, id);
  if (existing) {
    await db.put(
      { ...existing, retries: (existing.retries ?? 0) + 1 },
      DB_NAME,
      id
    );
  }
}

export async function removeFromOutbox(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(DB_NAME, id);
}

/** Notes Cache */
export async function saveNoteCache(
  note: {
    id: number;
    courseId: number | null;
    title: string;
    titleEn: string;
    body: string;
    bodyEn: string;
    image: string;
    pdf: string;
    grade: string;
    order: number;
    createdAt: number;
    updatedAt: number;
  }
): Promise<void> {
  const db = await getDB();
  await db.put(DB_NAME, note, note.id);
}

export async function getNoteCache(noteId: number): Promise<{
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  body: string;
  bodyEn: string;
  image: string;
  pdf: string;
  grade: string;
  order: number;
  createdAt: number;
  updatedAt: number;
} | null> {
  const db = await getDB();
  return db.get(DB_NAME, noteId);
}

/** Video Progress */
export async function saveVideoProgress(
  lessonId: number,
  seconds: number,
  duration: number
): Promise<void> {
  const db = await getDB();
  await db.put(
    { lessonId, seconds, duration, updatedAt: Date.now() },
    DB_NAME,
    `${lessonId}`
  );
}

export async function getVideoProgress(lessonId: number): Promise<{
  seconds: number;
  duration: number;
} | null> {
  const db = await getDB();
  return db.get(DB_NAME, `${lessonId}`);
}

/** Settings */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put(DB_NAME, { key, value, updatedAt: Date.now() }, key);
}

export async function getSetting(key: string): Promise<unknown> {
  const db = await getDB();
  return db.get(DB_NAME, key);
}

/** Migration Helper */
export async function migrateFromLocalStorage(): Promise<void> {
  console.log('[idb] Migration from localStorage — not implemented (data preserved in LS)');
}