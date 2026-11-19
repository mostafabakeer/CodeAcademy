import { api, apiKeepalive } from '../api/client';
import { getVideoProgressLocal, setVideoProgressLocal } from './localStore';
import { getLocal, removeLocal, setLocal } from './storage';

/**
 * مزامنة تقدّم المشاهدة مع الخادم — خفيفة وبدون ضغط على الباك اند.
 *
 * - تجميع التغييرات في الذاكرة وأخذ الأكبر لكل درس.
 * - دفعة كل 180 ثانية (3 دقائق) أثناء المشاهدة + فورية عند الإكمال/إخفاء
 *   الصفحة/الخروج. الوتيرة الأطول تقلّل طلبات المزامنة ~66% مع بقاء التقدّم
 *   محفوظاً محلياً كل 5 ثوانٍ، فلا شيء يضيع عند الانقطاع.
 * - عند الفشل يبقى المعلّق محفوظاً على القرص ويُرسل لاحقاً (لا شيء يضيع).
 * - القراءة من الخادم مرة واحدة لكل جلسة تطبيق فقط.
 *
 * الثواني تُرسل كما هي؛ الخادم يقصّها على مدة الدرس ويحتفظ بالأكبر.
 */

const PENDING_KEY = 'dr_progress_pending_v1';
const LAST_PULL_KEY = 'dr_progress_last_pull_v1';
const FLUSH_INTERVAL_MS = 180_000;
const MAX_BATCH = 50;

/** يُطلق بعد نجاح الجلب إن تغيّر التخزين المحلي — تسمعه الصفحات المفتوحة. */
export const PROGRESS_PULLED_EVENT = 'dr:progress-pulled';

/** معلّق الإرسال: lessonId → أكبر ثواني لم تُرسل بعد. */
const pending = new Map<number, number>();
let timer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let pulledForUser: number | null = null;
let pullPromise: Promise<boolean> | null = null;
let listenersInstalled = false;

function loadPendingFromDisk(): void {
  const raw = getLocal(PENDING_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      const seconds = Number(value);
      if (Number.isInteger(id) && id > 0 && Number.isFinite(seconds) && seconds > 0) {
        pending.set(id, Math.max(pending.get(id) ?? 0, seconds));
      }
    }
  } catch {
    removeLocal(PENDING_KEY);
  }
}

function savePendingToDisk(): void {
  if (pending.size === 0) {
    removeLocal(PENDING_KEY);
    return;
  }
  setLocal(PENDING_KEY, JSON.stringify(Object.fromEntries(pending)));
}

function schedule(): void {
  if (timer) return;
  timer = setInterval(() => void flushProgress(), FLUSH_INTERVAL_MS);
}

function stopTimerIfIdle(): void {
  if (pending.size > 0 || !timer) return;
  clearInterval(timer);
  timer = null;
}

/** يسجّل مشاهدة جديدة. آمن للنداء المتكرر: يأخذ الأكبر فقط. */
export function queueProgress(lessonId: number, seconds: number): void {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return;
  const whole = Math.floor(seconds);
  if (whole <= 0) return;
  pending.set(lessonId, Math.max(pending.get(lessonId) ?? 0, whole));
  savePendingToDisk();
  schedule();
}

/**
 * يرسل الدفعة الحالية.
 * force=true يتجاوز شرط «الصفحة مرئية» (يُستخدم عند الإكمال/عودة الشبكة).
 */
export async function flushProgress(force = false): Promise<void> {
  if (flushing || pending.size === 0) return;
  if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  flushing = true;
  const snapshot = [...pending.entries()].slice(0, MAX_BATCH);
  try {
    await api('/api/progress/sync', {
      method: 'POST',
      body: JSON.stringify({
        items: snapshot.map(([lessonId, secondsWatched]) => ({ lessonId, secondsWatched })),
      }),
    });
    // نمسح فقط ما أُرسل فعلاً ولم تزد قيمته أثناء الطلب.
    for (const [id, seconds] of snapshot) {
      if ((pending.get(id) ?? 0) <= seconds) pending.delete(id);
    }
    savePendingToDisk();
  } catch {
    // يبقى المعلّق في الذاكرة + القرص ليُرسل لاحقاً.
  } finally {
    flushing = false;
    stopTimerIfIdle();
  }
}

/**
 * نسخة `pagehide`: إرسال keepalive لا يُلغى مع إغلاق التبويب.
 * لا نمسح المعلّق: لو فشل الإرسال (شبكة/خادم) يُعاد في الجلسة القادمة،
 * وإعادة إرسال قيمة أصغر آمنة لأن الخادم يحتفظ بالأكبر.
 */
export function flushProgressOnHide(): void {
  if (pending.size === 0) return;
  const items = [...pending.entries()]
    .slice(0, MAX_BATCH)
    .map(([lessonId, secondsWatched]) => ({ lessonId, secondsWatched }));
  apiKeepalive('/api/progress/sync', { items });
}

/**
 * يجلب تقدّم الطالب من الخادم ويدمج الأكبر في التخزين المحلي.
 * يعيد true لو تغيّر التخزين المحلي (تحتاج الإحصائيات إعادة حساب).
 *
 * النداء المتكرر أثناء الجلب يُعيد نفس الـ Promise بدل إطلاق طلب ثانٍ.
 */
export function pullProgress(userId: number, opts: { force?: boolean } = {}): Promise<boolean> {
  if (!opts.force && pulledForUser === userId) return pullPromise ?? Promise.resolve(false);
  pulledForUser = userId;

  pullPromise = (async () => {
    try {
      const res = await api<{ progress: { lessonId: number; secondsWatched: number }[] }>('/api/progress');
      let changed = false;

      for (const row of res.progress ?? []) {
        const lessonId = Number(row.lessonId);
        const serverSeconds = Math.max(0, Math.floor(Number(row.secondsWatched) || 0));
        if (!Number.isInteger(lessonId) || lessonId <= 0) continue;

        const local = getVideoProgressLocal(lessonId);
        const localSeconds = local?.seconds ?? 0;

        if (serverSeconds > localSeconds) {
          setVideoProgressLocal(lessonId, serverSeconds, local?.duration ?? 0);
          changed = true;
        } else if (localSeconds > serverSeconds) {
          // المحلي أحدث/أكبر (مشاهدة أوفلاين أو جهاز آخر) ⇒ يحتاج رفعاً.
          queueProgress(lessonId, localSeconds);
        }
      }

      setLocal(LAST_PULL_KEY, String(Date.now()));
      if (changed && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(PROGRESS_PULLED_EVENT));
      }
      return changed;
    } catch {
      // الشبكة غير متاحة — لا نغيّر شيئاً، والبيانات المحلية كافية للعمل.
      return false;
    }
  })();

  return pullPromise;
}

/**
 * يضمن أن محاولة الجلب الأولية لهذا المستخدم انتهت (نجحت أو فشلت).
 * تستخدمها صفحة الدرس قبل قراءة التقدّم المحلي حتى لا تُفتح الدرس على 0
 * لو كان التقدّم محفوظاً على الخادم فقط (جهاز جديد).
 */
export function ensureProgressPulled(userId: number): Promise<boolean> {
  if (pulledForUser === userId) return pullPromise ?? Promise.resolve(false);
  return pullProgress(userId);
}

/** يُركّب مستمعات الإخفاء/الإغلاق/عودة الشبكة مرة واحدة. */
export function installProgressSync(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  loadPendingFromDisk();

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushProgressOnHide();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flushProgressOnHide);
  window.addEventListener('online', () => void flushProgress(true));

  // ما تبقّى من جلسة سابقة يُرسل في أول فرصة.
  if (pending.size > 0) schedule();
}

/** آخر مرة نجح فيها جلب التقدّم من الخادم (0 = لم يحدث). */
export function lastPullAt(): number {
  return Number(getLocal(LAST_PULL_KEY)) || 0;
}
