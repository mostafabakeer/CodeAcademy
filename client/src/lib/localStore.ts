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

const NOTIF_PROMPT_KEY = 'notif_prompt_dismissed_at';

/** وقت آخر مرة قال فيها المستخدم "لاحقاً" لبطاقة تفعيل الإشعارات (0 = لم يحدث). */
export function getNotifPromptDismissedAt(): number {
  return Number(getLocal(NOTIF_PROMPT_KEY)) || 0;
}

export function setNotifPromptDismissed(): void {
  setLocal(NOTIF_PROMPT_KEY, String(Date.now()));
}

export interface VideoProgressLocal {
  /** الثواني المُشاهدة فعلاً (تغطية الفترات الحقيقية) — المرجع لكل الحسابات. */
  seconds: number;
  duration: number;
  updatedAt: number;
  /** آخر موضع تشغيل — للاستئناف فقط، ولا يعني أن الجزء شُوهد. */
  position?: number;
  /** فترات المشاهدة الحقيقية المدمجة [بداية, نهاية] بالثواني. */
  segments?: [number, number][];
}

/** الحد الأقصى لعدد الفترات المحفوظة (حماية من نمو لا نهائي بعد ساعات مشاهدة). */
const MAX_WATCH_SEGMENTS = 400;

/** يدمج فترات متقاطعة/متلاصقة ويرتّبها (يُستخدم قبل الحفظ). */
export function mergeWatchSegments(segments: [number, number][]): [number, number][] {
  const sorted = segments
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .map(([a, b]) => [Math.max(0, a), Math.max(0, b)] as [number, number])
    .sort((x, y) => x[0] - y[0]);

  const out: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1] + 0.5) {
      if (end > last[1]) last[1] = end;
    } else {
      out.push([start, end]);
    }
  }
  return out.length > MAX_WATCH_SEGMENTS ? keepLongestSegments(out, MAX_WATCH_SEGMENTS) : out;
}

/** عند تجاوز الحد: نحتفظ بأطول الفترات (أكبر تغطية) ثم نعيد ترتيبها زمنياً. */
function keepLongestSegments(segments: [number, number][], max: number): [number, number][] {
  return segments
    .map((segment, index) => ({ segment, index, length: segment[1] - segment[0] }))
    .sort((a, b) => b.length - a.length)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.segment);
}

/** كاش بسيط لـ getAllVideoProgressLocal لتجنب قراءة localStorage المتكررة */
let videoProgressCache: Record<number, VideoProgressLocal> | null = null;
let videoProgressCacheAt = 0;
const VIDEO_PROGRESS_CACHE_TTL = 1000; // 1 ثانية

/** مسودة عمل ملف المحرر قبل الحفظ في السيرفر (تُستعاد عند فتح الملف). */
export interface CodeDraft {
  code: string;
  at: number;
}

export function getCodeDraft(fileId: string | number): CodeDraft | null {
  const raw = getLocal(DRAFT_PREFIX + fileId);
  if (!raw) return null;
  // توافق مع الصيغة القديمة (نص الكود فقط بلا وقت).
  if (!raw.startsWith('{')) return { code: raw, at: 0 };
  try {
    const parsed = JSON.parse(raw) as CodeDraft;
    if (typeof parsed?.code === 'string') {
      return { code: parsed.code, at: Number(parsed.at) || 0 };
    }
  } catch {
    /* ignore */
  }
  return { code: raw, at: 0 };
}

export function setCodeDraft(fileId: string | number, code: string): void {
  setLocal(DRAFT_PREFIX + fileId, JSON.stringify({ code, at: Date.now() } satisfies CodeDraft));
}

export function clearCodeDraft(fileId: string | number): void {
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

export function setVideoProgressLocal(
  lessonId: number,
  seconds: number,
  duration: number,
  patch?: { segments?: [number, number][]; position?: number },
): void {
  const prev = getVideoProgressLocal(lessonId);
  const nextSeconds = Math.max(0, Number(seconds) || 0);
  const nextDuration = Number(duration) || prev?.duration || 0;

  let segments: [number, number][] | undefined;
  if (patch?.segments) {
    segments = mergeWatchSegments(patch.segments);
  } else if (prev?.segments?.length) {
    const prevCovered = prev.segments.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
    // تقدّم أكبر وصل من الخادم/جهاز آخر: يُعامل كأساس مشاهدة بدل تركه غير متسق مع الفترات.
    segments = nextSeconds > prevCovered + 0.5 ? [[0, nextSeconds]] : prev.segments;
  } else if (nextSeconds > (prev?.seconds ?? 0)) {
    // تقدّم قديم/قادم من الخادم بلا فترات ⇒ يُعامل كأساس مشاهدة
    // (قرار: لا نصفّر التقدّم القديم، والتصحيح يسري على المشاهدة الجديدة فقط).
    segments = [[0, nextSeconds]];
  }

  const position = patch?.position ?? prev?.position;
  const record: VideoProgressLocal = {
    seconds: nextSeconds,
    duration: nextDuration,
    updatedAt: Date.now(),
  };
  if (segments?.length) record.segments = segments;
  if (position !== undefined && Number.isFinite(position)) record.position = Math.max(0, position);

  setLocal(VIDEO_PREFIX + lessonId, JSON.stringify(record));
  videoProgressCache = null; // إبطال الكاش عند التحديث
}

/** خريطة كل تقدم المشاهدة المحلي: lessonId → progress (تُستخدم لحساب التقدم والإحصائيات في المتصفح). */
export function getAllVideoProgressLocal(): Record<number, VideoProgressLocal> {
  const now = Date.now();
  if (videoProgressCache && now - videoProgressCacheAt < VIDEO_PROGRESS_CACHE_TTL) {
    return videoProgressCache;
  }

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

  videoProgressCache = out;
  videoProgressCacheAt = now;
  return out;
}

/** يمسح كل تقدم المشاهدة المحلي (عند دخول مستخدم مختلف على نفس الجهاز). */
export function clearAllVideoProgress(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('codeacademy_' + VIDEO_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  videoProgressCache = null;
  videoProgressCacheAt = 0;
}

/** يمسح كل مسودات المحرر المحلية. */
export function clearAllDrafts(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('codeacademy_' + DRAFT_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** يمسح مراجعات الامتحانات المخزنة محليًا (لا تتسرب لآخر يستخدم نفس الجهاز). */
export function clearExamReviews(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('exam_review_')) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
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

// ===== Offline Queue for mutations =====

const OFFLINE_QUEUE_KEY = 'dr_code_offline_queue';

export interface OfflineQueueItem {
  id: string;
  type: 'exam_submit' | 'code_save' | 'video_progress';
  payload: unknown;
  createdAt: number;
  retries: number;
}

export function getOfflineQueue(): OfflineQueueItem[] {
  const raw = getLocal(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OfflineQueueItem[];
  } catch {
    return [];
  }
}

export function addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'retries'>): void {
  const queue = getOfflineQueue();
  queue.push({
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    retries: 0,
  });
  setLocal(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineQueue().filter((item) => item.id !== id);
  setLocal(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function incrementOfflineRetry(id: string): void {
  const queue = getOfflineQueue().map((item) =>
    item.id === id ? { ...item, retries: item.retries + 1 } : item
  );
  setLocal(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function clearOfflineQueue(): void {
  removeLocal(OFFLINE_QUEUE_KEY);
}
