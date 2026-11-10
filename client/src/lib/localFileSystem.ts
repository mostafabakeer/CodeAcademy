/**
 * نظام تخزين محلي كامل للمشاريع والأكواد
 * يستخدم IndexedDB بدلاً من localStorage للسعات أكبر
 */

const DB_NAME = 'drcode-local';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const STORE_META = 'meta';

interface LocalFile {
  id: string;
  name: string;
  language: 'javascript' | 'python' | 'html' | 'css';
  code: string;
  createdAt: number;
  updatedAt: number;
}

interface LocalMeta {
  lastOpenedId: string | null;
  settings: Record<string, unknown>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function getAllFiles(): Promise<LocalFile[]> {
  const db = await getDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const store = tx.objectStore(STORE_FILES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => resolve([]);
  });
}

export async function getFileById(id: string): Promise<LocalFile | undefined> {
  const db = await getDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

export async function saveFile(file: Omit<LocalFile, 'createdAt'>): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction(STORE_FILES, 'readwrite');
  const store = tx.objectStore(STORE_FILES);
  const existing = await store.get(file.id);
  await store.put({
    ...file,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  await tx.done;
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_FILES, 'readwrite');
  await tx.objectStore(STORE_FILES).delete(id);
  await tx.done;
}

export async function generateId(): Promise<string> {
  return crypto.randomUUID();
}

export async function setLastOpenedFileId(fileId: string | null): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_META, 'readwrite');
  await tx.objectStore(STORE_META).put({ key: 'lastOpened', value: fileId, updated: Date.now() });
  await tx.done;
}

export async function getLastOpenedFileId(): Promise<string | null> {
  const db = await getDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get('lastOpened');
    req.onsuccess = () => resolve((req.result as any)?.value ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function syncToFileServer(files: LocalFile[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const res = await fetch(`/api/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          language: file.language,
          code: file.code,
        }),
      });
      if (res.ok) success++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { success, failed };
}
