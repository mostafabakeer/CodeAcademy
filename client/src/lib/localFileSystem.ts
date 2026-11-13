/**
 * تخزين محلي كامل لملفات الكود (IndexedDB).
 *
 * الملف المحلي يحمل `remoteId` بعد أول مزامنة مع الخادم، و`pendingSync` عندما
 * يكون فيه تعديل لم يُرفع. هذا ما يجعل الكود يظهر على أي جهاز بعد تسجيل الدخول
 * مع استمرار العمل بدون إنترنت.
 */

const DB_NAME = 'drcode-local';
// v2: أضفنا فهرس remoteId + حقول المزامنة. الترقية لا تمسح الملفات القديمة.
const DB_VERSION = 2;
const STORE_FILES = 'files';
const STORE_META = 'meta';

export type CodeLanguage = 'javascript' | 'python' | 'html' | 'css';

export interface LocalFile {
  id: string;
  /** معرّف الملف على الخادم (code_files.id) بعد المزامنة الأولى. */
  remoteId?: number;
  name: string;
  language: CodeLanguage;
  code: string;
  createdAt: number;
  updatedAt: number;
  /** true عندما يوجد تعديل محلي لم يُرفع للخادم بعد. */
  pendingSync?: boolean;
  /** آخر وقت تأكدنا فيه أن نسخة الخادم مطابقة. */
  lastSyncedAt?: number;
  /** سجل النسخ القادم من الخادم (يُستخدم لاستعادة نسخة قديمة). */
  versions?: { at: number; code: string }[];
}

interface LocalMeta {
  key: string;
  value: unknown;
  updated?: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('remoteId', 'remoteId');
      } else {
        const store = request.transaction!.objectStore(STORE_FILES);
        if (!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt', 'updatedAt');
        if (!store.indexNames.contains('remoteId')) store.createIndex('remoteId', 'remoteId');
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('قاعدة البيانات مفتوحة في تاب آخر — أعد تحميل الصفحة'));
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

export async function getAllFiles(): Promise<LocalFile[]> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_FILES, 'readonly');
    const all = await requestToPromise(tx.objectStore(STORE_FILES).getAll() as IDBRequest<LocalFile[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    console.error('[localFileSystem] getAllFiles:', e);
    return [];
  }
}

export async function getFileById(id: string): Promise<LocalFile | undefined> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_FILES, 'readonly');
    return await requestToPromise(tx.objectStore(STORE_FILES).get(id) as IDBRequest<LocalFile | undefined>);
  } catch {
    return undefined;
  }
}

export async function getFileByRemoteId(remoteId: number): Promise<LocalFile | undefined> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_FILES, 'readonly');
    return await requestToPromise(
      tx.objectStore(STORE_FILES).index('remoteId').get(remoteId) as IDBRequest<LocalFile | undefined>,
    );
  } catch {
    return undefined;
  }
}

/**
 * يحفظ/يحدّث ملفاً محلياً. إن لم يُمرَّر `updatedAt` نستخدم الوقت الحالي.
 * لا نستبدل createdAt المحفوظ أبداً.
 */
export async function saveFile(
  file: Omit<LocalFile, 'createdAt'> & { createdAt?: number },
): Promise<LocalFile> {
  const existing = await getFileById(file.id);
  const now = Date.now();
  const record: LocalFile = {
    ...file,
    createdAt: existing?.createdAt ?? file.createdAt ?? now,
    updatedAt: file.updatedAt ?? now,
  };
  const db = await getDB();
  const tx = db.transaction(STORE_FILES, 'readwrite');
  tx.objectStore(STORE_FILES).put(record);
  await txDone(tx);
  return record;
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_FILES, 'readwrite');
  tx.objectStore(STORE_FILES).delete(id);
  await txDone(tx);
}

export async function generateId(): Promise<string> {
  return crypto.randomUUID();
}

export async function setLastOpenedFileId(fileId: string | null): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ key: 'lastOpened', value: fileId, updated: Date.now() });
  await txDone(tx);
}

export async function getLastOpenedFileId(): Promise<string | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const row = await requestToPromise(
      tx.objectStore(STORE_META).get('lastOpened') as IDBRequest<LocalMeta | undefined>,
    );
    return (row?.value as string | null) ?? null;
  } catch {
    return null;
  }
}
