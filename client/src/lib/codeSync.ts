/**
 * مزامنة ملفات الكود بين IndexedDB والسحابة.
 *
 * التصميم: offline-first.
 * - الكتابة المحلية فورية دائماً (لا تنتظر الشبكة).
 * - كل تعديل يُرفع بعدها للخادم (best-effort)، وإن فشل يبقى pendingSync.
 * - عند فتح CodeLab/عودة الاتصال نجري مزامنة دمج (merge) بالأحدث updatedAt.
 *
 * هذا هو ما يجعل كود الطالب يظهر على جهاز آخر بعد تسجيل الدخول، مع استمرار
 * العمل بدون إنترنت (وهو ما فُقد عندما حُوّل المحرر لتخزين محلي فقط).
 */

import { api } from '../api/client';
import {
  getAllFiles,
  getFileById,
  saveFile,
  generateId,
  type LocalFile,
} from './localFileSystem';

export interface RemoteCodeFile {
  id: number;
  name: string;
  language: string;
  code: string;
  createdAt: number;
  updatedAt: number;
  versions?: { at: number; code: string }[];
}

export interface SyncResult {
  ok: boolean;
  pulled: number;
  pushed: number;
  error?: string;
}

let inFlight: Promise<SyncResult> | null = null;

function asLanguage(value: string): LocalFile['language'] {
  return value === 'python' || value === 'html' || value === 'css' ? value : 'javascript';
}

function remoteSnapshot(remote: RemoteCodeFile) {
  return {
    name: remote.name,
    language: asLanguage(remote.language),
    code: remote.code ?? '',
    updatedAt: Number(remote.updatedAt) || Date.now(),
    versions: remote.versions,
  };
}

/** يحوّل الملف السحابي إلى سجل محلي جديد. */
function remoteToLocal(remote: RemoteCodeFile, id: string): LocalFile {
  return {
    id,
    remoteId: remote.id,
    ...remoteSnapshot(remote),
    createdAt: Number(remote.createdAt) || Date.now(),
    pendingSync: false,
    lastSyncedAt: Date.now(),
  };
}

/**
 * ينشئ/يحدّث الملف على الخادم ويحدّث المعرّف المحلي.
 * يعيد true عند النجاح، وfalse مع تعليم الملف pendingSync عند الفشل.
 */
export async function pushCodeFile(file: LocalFile): Promise<boolean> {
  try {
    if (file.remoteId) {
      const d = await api<{ file: RemoteCodeFile }>(`/api/code/${file.remoteId}`, {
        method: 'PUT',
        body: { code: file.code },
      });
      await saveFile({
        ...file,
        versions: d.file?.versions ?? file.versions,
        updatedAt: Number(d.file?.updatedAt) || file.updatedAt,
        pendingSync: false,
        lastSyncedAt: Date.now(),
      });
    } else {
      const d = await api<{ file: RemoteCodeFile }>('/api/code', {
        method: 'POST',
        body: { name: file.name, language: file.language, code: file.code },
      });
      if (!d?.file?.id) throw new Error('استجابة غير صالحة من الخادم');
      await saveFile({
        ...file,
        remoteId: d.file.id,
        versions: d.file.versions,
        pendingSync: false,
        lastSyncedAt: Date.now(),
      });
    }
    return true;
  } catch (e) {
    console.warn('[codeSync] push failed, will retry:', (e as Error).message);
    try {
      await saveFile({ ...file, pendingSync: true });
    } catch {
      /* ignore */
    }
    return false;
  }
}

export async function deleteRemoteCodeFile(remoteId: number): Promise<boolean> {
  try {
    await api(`/api/code/${remoteId}`, { method: 'DELETE' });
    return true;
  } catch {
    // الحذف سيُعاد عند المزامنة القادمة فقط لو أبقينا الملف؛ نكتفي بالإبلاغ.
    return false;
  }
}

/** تحديث الاسم/اللغة على الخادم (ينشئ الملف أولاً لو لم يكن مزامناً بعد). */
export async function updateRemoteMeta(file: LocalFile): Promise<boolean> {
  if (!file.remoteId) return pushCodeFile(file);
  try {
    await api(`/api/code/${file.remoteId}`, {
      method: 'PATCH',
      body: { name: file.name, language: file.language },
    });
    await saveFile({ ...file, pendingSync: false, lastSyncedAt: Date.now() });
    return true;
  } catch {
    await saveFile({ ...file, pendingSync: true });
    return false;
  }
}

/** يجلب تفاصيل ملف واحد (نسخه الكاملة) لتحديث سجل versions محلياً. */
export async function refreshRemoteFile(remoteId: number): Promise<LocalFile | null> {
  try {
    const d = await api<{ file: RemoteCodeFile }>(`/api/code/${remoteId}`);
    if (!d?.file) return null;
    const local = (await getAllFiles()).find((f) => f.remoteId === remoteId);
    if (!local) return null;
    if (d.file.updatedAt > local.updatedAt && !local.pendingSync) {
      const merged = await saveFile({
        ...local,
        ...remoteSnapshot(d.file),
        pendingSync: false,
        lastSyncedAt: Date.now(),
      });
      return merged;
    }
    return await saveFile({
      ...local,
      versions: d.file.versions,
      lastSyncedAt: Date.now(),
    });
  } catch {
    return null;
  }
}

/**
 * بعض نسخ الخادم القديمة تُرجع قائمة الملفات بلا الكود (قبل دعم withCode=1).
 * في هذه الحالة لا نستبدل الكود المحلي بكود فارغ أبداً، بل نجلب الملف على حدة
 * — وهو ما كان يعمل دائماً — حتى يظل الكود يظهر على أي جهاز بعد تسجيل الدخول
 * حتى لو تأخّر نشر تحديث الخادم.
 *
 * `needsCode` يقلّل الطلبات: لا نجلب تفاصيل ملف نعرف أن نسخته المحلية أحدث
 * (أو مساوية)، لأن الدمج سيرفع المحلي أو لا يفعل شيئاً. هذا مهم لأن الخادم
 * يحدّ الطلبات (30/دقيقة) وقد يرفض جلب عشرات الملفات دفعة واحدة.
 */
async function fillMissingCodes(
  files: RemoteCodeFile[],
  needsCode: (f: RemoteCodeFile) => boolean,
): Promise<{ files: RemoteCodeFile[]; failed: Set<number> }> {
  const missing = files.filter((f) => typeof f.code !== 'string' && needsCode(f));
  const failed = new Set<number>();
  const filled = new Map<number, RemoteCodeFile>();

  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (f) => {
        try {
          const d = await api<{ file: RemoteCodeFile }>(`/api/code/${f.id}`);
          if (d?.file && typeof d.file.code === 'string') {
            filled.set(f.id, { ...f, ...d.file });
          } else {
            failed.add(f.id);
          }
        } catch {
          failed.add(f.id);
        }
      }),
    );
  }

  return { files: files.map((f) => filled.get(f.id) ?? f), failed };
}

/**
 * مزامنة كاملة. آمنة للاستدعاء المتكرر: أي استدعاء أثناء مزامنة جارية يعيد
 * نفس الـ promise بدل تنفيذ مزامنة موازية تُسبب تكرار الملفات.
 */
export function syncCodeFiles(): Promise<SyncResult> {
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<SyncResult> => {
    let remote: RemoteCodeFile[] = [];
    try {
      const res = await api<{ files: RemoteCodeFile[] }>('/api/code?withCode=1');
      remote = Array.isArray(res?.files) ? res.files : [];
    } catch (e) {
      return { ok: false, pulled: 0, pushed: 0, error: (e as Error).message };
    }

    let pulled = 0;
    let pushed = 0;
    const locals = await getAllFiles();
    const localByRemote = new Map<number, LocalFile>();
    for (const l of locals) if (l.remoteId) localByRemote.set(l.remoteId, l);

    /** ملف محلي قديم أُنشئ قبل المزامنة (بلا remoteId) بنفس الاسم واللغة. */
    const legacyFor = (r: RemoteCodeFile) =>
      locals.find(
        (l) =>
          !l.remoteId &&
          l.name.trim() === r.name.trim() &&
          asLanguage(l.language) === asLanguage(r.language),
      );

    // هل نحتاج كود النسخة السحابية فعلاً؟ (انظر شرح fillMissingCodes)
    const needsCode = (r: RemoteCodeFile) => {
      const local = localByRemote.get(r.id);
      if (local) return r.updatedAt > local.updatedAt;
      const legacy = legacyFor(r);
      if (legacy) return !(legacy.updatedAt > r.updatedAt);
      return true;
    };

    const { files: filledRemote, failed } = await fillMissingCodes(remote, needsCode);

    // 1) السحابة → المحلي (مع الدمج)
    for (const r of filledRemote) {
      const local = localByRemote.get(r.id);

      // بلا كود: إما فشل جلبه (لا نلمس المحلي)، أو أن المحلي أحدث فلا حاجة له.
      if (typeof r.code !== 'string') {
        if (failed.has(r.id)) continue;
        if (local) {
          if ((local.pendingSync || local.updatedAt > r.updatedAt) && (await pushCodeFile(local))) {
            pushed++;
          }
          continue;
        }
        const legacy = legacyFor(r);
        if (legacy && legacy.updatedAt > r.updatedAt) {
          await saveFile({ ...legacy, remoteId: r.id, pendingSync: true });
          const fresh = (await getFileById(legacy.id)) ?? legacy;
          if (await pushCodeFile(fresh)) pushed++;
        }
        continue;
      }

      if (!local) {
        // ملف موجود على الخادم وليس هنا (جهاز جديد، أو أُنشئ من جهاز آخر).
        // قبل إنشاء نسخة جديدة: هل يوجد ملف محلي قديم بلا remoteId بنفس الاسم؟
        const legacy = legacyFor(r);
        if (legacy) {
          if (legacy.updatedAt > r.updatedAt) {
            await saveFile({ ...legacy, remoteId: r.id, pendingSync: true });
            if (await pushCodeFile((await getFileById(legacy.id)) ?? legacy)) pushed++;
          } else {
            await saveFile({
              ...legacy,
              ...remoteSnapshot(r),
              remoteId: r.id,
              pendingSync: false,
              lastSyncedAt: Date.now(),
            });
            pulled++;
          }
          continue;
        }

        const id = await generateId();
        await saveFile(remoteToLocal(r, id));
        pulled++;
        continue;
      }

      // ملف موجود في الاثنين
      if (local.pendingSync) {
        if (local.updatedAt >= r.updatedAt) {
          if (await pushCodeFile(local)) pushed++;
        } else {
          await saveFile({
            ...local,
            ...remoteSnapshot(r),
            pendingSync: false,
            lastSyncedAt: Date.now(),
          });
          pulled++;
        }
        continue;
      }

      if (r.updatedAt > local.updatedAt) {
        await saveFile({
          ...local,
          ...remoteSnapshot(r),
          pendingSync: false,
          lastSyncedAt: Date.now(),
        });
        pulled++;
      } else if (local.updatedAt > r.updatedAt) {
        if (await pushCodeFile(local)) pushed++;
      }
    }

    // 2) المحلي الذي لم يُرفع أبداً → إنشاء على الخادم
    for (const l of locals) {
      if (l.remoteId) continue;
      const still = await getFileById(l.id);
      if (!still || still.remoteId) continue;
      if (await pushCodeFile(still)) pushed++;
    }

    return { ok: true, pulled, pushed };
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
