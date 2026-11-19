import { useEffect, useState, useRef, useCallback } from 'react';
import { getLocal, setLocal, removeLocal } from './storage';

const TIMER_PREFIX = 'exam_timer:';
const STORAGE_ROOT = 'codeacademy_';

interface DeadlineEntry {
  deadline: number;
}

function timerKey(examId: string): string {
  return TIMER_PREFIX + examId;
}

function rawTimerKey(examId: string): string {
  return STORAGE_ROOT + timerKey(examId);
}

function readDeadline(examId: string): number | null {
  const raw = getLocal(timerKey(examId));
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as DeadlineEntry;
    if (typeof entry?.deadline === 'number' && Number.isFinite(entry.deadline)) {
      return entry.deadline;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeDeadline(examId: string, deadline: number): void {
  const entry: DeadlineEntry = { deadline };
  setLocal(timerKey(examId), JSON.stringify(entry));
}

/** يُستدعى عند التسليم الناجح أو بدء محاولة جديدة لمسح أي مهلة قديمة. */
export function clearExamTimer(examId: string): void {
  removeLocal(timerKey(examId));
}

/** تنسيق ثابت حصري للعرض: `MM:SS` أو `H:MM:SS`. */
export function formatExamClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface UseExamDeadlineOptions {
  examId: string | undefined;
  /** مدة الامتحان بالدقائق من بيانات الخادم؛ null/0/غير محدد = بلا عدّاد. */
  durationMinutes: number | null | undefined;
  /** هل المستخدم في طور أداء فعلي للامتحان الآن (لا مراجعة/نتيجة/شاشة ترحيب). */
  active: boolean;
}

/**
 * يحسب/يحفظ/يزامن موعد نهاية الامتحان فقط — بلا أي مؤقّت React.
 *
 * المهلة محفوظة محليًا، فإعادة التحميل تستأنف من النقطة ذاتها بالضبط.
 * يستخدم setTimeout مع Page Visibility API لضمان العمل في التبويبات الخلفية.
 */
export function useExamDeadline({
  examId,
  durationMinutes,
  active,
}: UseExamDeadlineOptions): { deadline: number | null } {
  const [deadline, setDeadline] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // بدء العدّاد من جديد أو استئناؤه من مهلة محفوظة (مرة واحدة لكل امتحان).
  useEffect(() => {
    if (!examId || !durationMinutes || durationMinutes <= 0 || !active) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setDeadline(null);
      return;
    }
    const saved = readDeadline(examId);
    const next = saved ?? Date.now() + durationMinutes * 60_000;
    if (!saved) writeDeadline(examId, next);
    setDeadline(next);

    // نحسب الوقت المتبقي ونضبط setTimeout واحد فقط
    const remaining = next - Date.now();
    if (remaining > 0) {
      timeoutRef.current = setTimeout(() => {
        // الوقت انتهى — نعيد رسم الصفحة عبر تعيين deadline = 0
        setDeadline(0);
        timeoutRef.current = null;
      }, remaining);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [examId, durationMinutes, active]);

  // مزامنة دفاعية بين التبويبات: إذا تغيّرت المهلة في تبويب آخر نتبنّاها.
  useEffect(() => {
    if (!examId) return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key !== rawTimerKey(examId)) return;
      const d = readDeadline(examId);
      if (d) setDeadline(d);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [examId]);

  return { deadline };
}

/**
 * هوك مخصص للعد التنازلي الموثوق الذي يعمل في التبويبات الخلفية
 * يستخدم setTimeout + Page Visibility API لضمان التفعيل عند انتهاء الوقت
 */
export function useExamAutoSubmit(
  deadline: number | null,
  onExpire: () => void,
  enabled: boolean
): void {
  const onExpireRef = useRef(onExpire);
  const enabledRef = useRef(enabled);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  // تحديث المراجع عند التغير
  onExpireRef.current = onExpire;
  enabledRef.current = enabled;

  useEffect(() => {
    // تنظيف عند إلغاء التفعيل
    if (!enabled || !deadline) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      submittedRef.current = false;
      return;
    }

    // لا نكرر الإرسال إذا تم بالفعل
    if (submittedRef.current) return;

    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      // الوقت انتهى بالفعل
      submittedRef.current = true;
      onExpireRef.current();
      return;
    }

    // نضبط setTimeout واحد للوقت المحدد
    timeoutRef.current = setTimeout(() => {
      if (!submittedRef.current && enabledRef.current) {
        submittedRef.current = true;
        onExpireRef.current();
      }
      timeoutRef.current = null;
    }, remaining);

    // دالة تنظيف
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [deadline, enabled]);

  // Page Visibility API: نتحقق عند عودة التبويب للواجهة
  useEffect(() => {
    if (!enabled || !deadline || submittedRef.current) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          // الوقت انتهى أثناء وجودنا في التبويب الخلفي
          submittedRef.current = true;
          onExpireRef.current();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [deadline, enabled]);
}