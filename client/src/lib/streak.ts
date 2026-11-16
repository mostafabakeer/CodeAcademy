import { getLocal, removeLocal, setLocal } from './storage';

/**
 * سلسلة الحماس اليومية (streak) — تُحسب محلياً على الجهاز.
 *
 * لا نستخدم تاريخ UTC لأن الطالب في مصر/السعودية قد يذاكر بعد منتصف الليل
 * بقليل، فنريد «اليوم» بتوقيت جهازه لا بتوقيت الخادم. الشكل المخزَّن:
 * { current, best, lastDay } حيث lastDay = YYYY-MM-DD محلياً.
 *
 * السلسلة تبقى «حية» إذا كان آخر يوم نشاط هو اليوم أو أمس (لم تنكسر بعد)،
 * وتنكسر فقط إذا مرّ يوم كامل بلا نشاط. تُزاد مرة واحدة في اليوم عند أول
 * نشاط حقيقي: مشاهدة درس، تسليم امتحان، أو حفظ كود.
 */
const STREAK_KEY = 'streak';

export interface StreakState {
  current: number;
  best: number;
  lastDay: string;
}

const EMPTY: StreakState = { current: 0, best: 0, lastDay: '' };

/** مفتاح اليوم بالتوقيت المحلي (لا UTC) بصيغة YYYY-MM-DD. */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayKeyOffset(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

function readState(): StreakState {
  const raw = getLocal(STREAK_KEY);
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Partial<StreakState>;
    return {
      current: Math.max(0, Number(parsed.current) || 0),
      best: Math.max(0, Number(parsed.best) || 0),
      lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : '',
    };
  } catch {
    return { ...EMPTY };
  }
}

/** الحالة المعروضة الآن: current = 0 إذا انكسرت السلسلة (مرّ يوم كامل بلا نشاط). */
export function getStreak(now = new Date()): StreakState {
  const state = readState();
  if (!state.lastDay) return { ...state, current: 0 };
  const today = dayKey(now);
  const yesterday = dayKeyOffset(-1, now);
  if (state.lastDay === today || state.lastDay === yesterday) return state;
  return { ...state, current: 0 };
}

export interface TouchResult {
  state: StreakState;
  /** أول نشاط في هذا اليوم (كانت السلسلة لم تُزَد بعد اليوم). */
  isNewDay: boolean;
  /** بدأت سلسلة جديدة من 1 (لم يكن هناك نشاط أمس). */
  justStarted: boolean;
}

/** يسجّل نشاط اليوم. آمن للاستدعاء المتكرر — لا يكتب إلا مرة واحدة يومياً. */
export function touchStreak(now = new Date()): TouchResult {
  const state = getStreak(now);
  const today = dayKey(now);
  if (state.lastDay === today) return { state, isNewDay: false, justStarted: false };

  const yesterday = dayKeyOffset(-1, now);
  const current = state.lastDay === yesterday ? state.current + 1 : 1;
  const next: StreakState = {
    current,
    best: Math.max(state.best, current),
    lastDay: today,
  };
  setLocal(STREAK_KEY, JSON.stringify(next));
  return { state: next, isNewDay: true, justStarted: current === 1 };
}

/** يمسح السلسلة (عند دخول حساب مختلف على نفس الجهاز). */
export function resetStreak(): void {
  removeLocal(STREAK_KEY);
}
