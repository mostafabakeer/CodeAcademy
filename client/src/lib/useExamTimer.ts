import { useEffect, useState } from 'react';
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
 * كان هذا الهوك يحدّث حالة الصفحة كل 250ms، فيُعاد رسم صفحة الامتحان كاملة
 * (مئات العناصر) أربع مرات في الثانية. الآن العدّ التنازلي يتم داخل مكوّن
 * صغير مستقل (ExamClock) مرة واحدة كل ثانية، وتبقى الصفحة ثابتة.
 *
 * المهلة محفوظة محليًا، فإعادة التحميل تستأنف من النقطة ذاتها بالضبط.
 */
export function useExamDeadline({
  examId,
  durationMinutes,
  active,
}: UseExamDeadlineOptions): { deadline: number | null } {
  const [deadline, setDeadline] = useState<number | null>(null);

  // بدء العدّاد من جديد أو استئناؤه من مهلة محفوظة (مرة واحدة لكل امتحان).
  useEffect(() => {
    if (!examId || !durationMinutes || durationMinutes <= 0 || !active) {
      setDeadline(null);
      return;
    }
    const saved = readDeadline(examId);
    const next = saved ?? Date.now() + durationMinutes * 60_000;
    if (!saved) writeDeadline(examId, next);
    setDeadline(next);
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