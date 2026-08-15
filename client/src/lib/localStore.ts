import { getLocal, setLocal, removeLocal } from './storage';

// ===== الطبقة الأولى (localStorage): بيانات هشّة خاصة بالمتصفح فقط =====

const DRAFT_PREFIX = 'draft:';
const VIDEO_PREFIX = 'video:';

export interface VideoProgressLocal {
  seconds: number;
  duration: number;
  updatedAt: number;
}

/** مسودة عمل ملف المحرر قبل الحفظ في السيرفر (تُستعاد عند فتح الملف). */
export function getCodeDraft(fileId: number): string | null {
  return getLocal(DRAFT_PREFIX + fileId);
}

export function setCodeDraft(fileId: number, code: string): void {
  setLocal(DRAFT_PREFIX + fileId, code);
}

export function clearCodeDraft(fileId: number): void {
  removeLocal(DRAFT_PREFIX + fileId);
}

/** تقدم مشاهدة الدرس محلياً (فوري حتى لو السيرفر متأخر). */
export function getVideoProgressLocal(lessonId: number): VideoProgressLocal | null {
  const raw = getLocal(VIDEO_PREFIX + lessonId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VideoProgressLocal;
  } catch {
    return null;
  }
}

export function setVideoProgressLocal(lessonId: number, seconds: number, duration: number): void {
  setLocal(VIDEO_PREFIX + lessonId, JSON.stringify({ seconds, duration, updatedAt: Date.now() }));
}

export function clearVideoProgressLocal(lessonId: number): void {
  removeLocal(VIDEO_PREFIX + lessonId);
}

/** خريطة كل تقدم المشاهدة المحلي: lessonId → progress (تُستخدم لحساب التقدم والإحصائيات في المتصفح). */
export function getAllVideoProgressLocal(): Record<number, VideoProgressLocal> {
  const out: Record<number, VideoProgressLocal> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('codeacademy_' + VIDEO_PREFIX)) continue;
      const lessonId = Number(key.slice(('codeacademy_' + VIDEO_PREFIX).length));
      if (!Number.isFinite(lessonId)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const v = JSON.parse(raw) as VideoProgressLocal;
        if (typeof v?.seconds === 'number') out[lessonId] = v;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}
