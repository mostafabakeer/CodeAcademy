import { getLocal, setLocal, removeLocal } from './storage';

/** لقطة الهوية المؤكدة محليًا تُسترجَع عند فشل /me بعد إعادة التحميل كي لا يُطرد المستخدم من حسابه. */
export interface SessionSnapshot {
  v: 1;
  user: {
    id: number;
    fullName: string;
    phone: string;
    grade: string;
    role: 'student' | 'admin';
    subscription?: boolean;
    blocked?: boolean;
    createdAt?: number;
  };
  levels: unknown[];
  examResults: unknown[];
  at: number;
}

const SESSION_KEY = 'dr_code_session';

// ===== الطبقة الأولى (localStorage): بيانات هشّة خاصة بالمتصفح فقط =====

const DRAFT_PREFIX = 'draft:';
const VIDEO_PREFIX = 'video:';
const INSTALL_DISMISSED_KEY = 'install_dismissed';

/** هل رفض المستخدم تثبيت الموقع نهائياً؟ (لا تظهر رسالة التثبيت بعده أبداً). */
export function getInstallDismissed(): boolean {
  return getLocal(INSTALL_DISMISSED_KEY) === '1';
}

export function setInstallDismissed(): void {
  setLocal(INSTALL_DISMISSED_KEY, '1');
}

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

export function getSessionSnapshot(): SessionSnapshot | null {
  const raw = getLocal(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SessionSnapshot;
    if (s?.v === 1 && s?.at && s?.user?.id) return s;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSessionSnapshot(
  user: SessionSnapshot['user'],
  levels: unknown[],
  examResults: unknown[],
): void {
  setLocal(SESSION_KEY, JSON.stringify({ v: 1, user, levels, examResults, at: Date.now() }));
}

export function clearSessionSnapshot(): void {
  removeLocal(SESSION_KEY);
}
