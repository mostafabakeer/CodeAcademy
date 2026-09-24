import { useCallback, useEffect, useRef, useState } from 'react';
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

interface UseExamTimerOptions {
  examId: string | undefined;
  /** مدة الامتحان بالدقائق من بيانات الخادم؛ null/0/غير محدد = بلا عدّاد. */
  durationMinutes: number | null | undefined;
  /** هل المستخدم في طور أداء فعلي للامتحان الآن (لا مراجعة/نتيجة/شاشة ترحيب). */
  active: boolean;
  /** هل البيانات كاملة بما يكفي للسماح بالتسليم التلقائي عند الانتهاء. */
  enabled: boolean;
  /** يُستدعى مرة واحدة عند بلوغ الصفر. */
  onExpire: () => void;
}

/**
 * عدّاد امتحان يعتمد على `deadline` محفوظ محليًا، لا على تناقص بالتكت:
 * يُحسب المتبقي من الساعة في كل لحظة، فإعادة التحميل تستأنف من النقطة ذاتها
 * بالضبط حتى بعد إغلاق التبويب (يبقى الموعد في localStorage) بتوافق مع سلوك
 * التطبيق الحالي للمسودات.
 */
export function useExamTimer({
  examId,
  durationMinutes,
  active,
  enabled,
  onExpire,
}: UseExamTimerOptions): { remainingMs: number | null } {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const expireHandledRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const tick = useCallback(() => {
    const d = deadlineRef.current;
    setRemainingMs(d === null ? null : Math.max(0, d - Date.now()));
  }, []);

  // بدء العدّاد من جديد أو استئناؤه من مهلة محفوظة (مرة واحدة لكل امتحان).
  useEffect(() => {
    if (!examId || !durationMinutes || durationMinutes <= 0 || !active) {
      deadlineRef.current = null;
      setRemainingMs(null);
      expireHandledRef.current = false;
      return;
    }
    const saved = readDeadline(examId);
    deadlineRef.current = saved ?? Date.now() + durationMinutes * 60_000;
    if (!saved) writeDeadline(examId, deadlineRef.current);
    setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
    expireHandledRef.current = false;
  }, [examId, durationMinutes, active]);

  // تحديث متكرر مُستقٍ من الساعة (دقة بلا انجراف).
  useEffect(() => {
    if (!active || deadlineRef.current === null) return;
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [active, tick]);

  // مزامنة دفاعية بين التبويبات: إذا تغيّرت المهلة في تبويب آخر نتبنّاها.
  useEffect(() => {
    if (!examId) return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key !== rawTimerKey(examId)) return;
      const d = readDeadline(examId);
      if (d) {
        deadlineRef.current = d;
        tick();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [examId, tick]);

  // بلوغ الصفر → استدعاء onExpire مرة واحدة فقط (منها التسليم التلقائي).
  useEffect(() => {
    const d = deadlineRef.current;
    if (!examId || !active || d === null) {
      expireHandledRef.current = false;
      return;
    }
    if (Date.now() >= d) {
      // لا نعلّم الانتهاء كـ"مُعالج" إلا حين نستدعي onExpire فعليًا؛ أثناء التحميل
      // (enabled = false) يُرجَّأ التسليم إلى أن تكتمل البيانات ثم يُستدعى عندئذ.
      if (!expireHandledRef.current && enabled) {
        expireHandledRef.current = true;
        onExpireRef.current();
      }
    } else {
      expireHandledRef.current = false;
    }
  }, [remainingMs, examId, active, enabled]);

  return { remainingMs };
}