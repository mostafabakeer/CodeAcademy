import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { api, ApiError, recordAuthFailure, clearAuthFail } from '../api/client';
import { getBootstrapSync, loadBootstrap, clearBootstrapCache } from '../lib/content';
import { getAllVideoProgressLocal } from '../lib/localStore';
import { computeStats, emptyStats, type LevelTier, type StudentStats } from '../lib/stats';

export interface User {
  id: number;
  fullName: string;
  phone: string;
  grade: string;
  role: 'student' | 'admin';
  subscription?: boolean;
  blocked?: boolean;
  createdAt?: number;
}

export interface ExamResultSummary {
  examId: number;
  best: number;
  score: number;
  correct: number;
  total: number;
  attempts: number;
}

interface MeResponse {
  user: User;
  levels: LevelTier[];
  examResults: ExamResultSummary[];
}

function statsFor(user: User, levels: LevelTier[], examResults: ExamResultSummary[]): StudentStats {
  const content = getBootstrapSync(user.id);
  if (!content) return emptyStats(levels);
  const watch = getAllVideoProgressLocal();
  return computeStats({
    lessons: content.lessons,
    exams: content.exams,
    examResults,
    watch,
    tiers: levels,
  });
}

/** يُنظّف مراجعات الامتحانات المخزنة محليًا (لا تتسرب لآخر يستخدم نفس الجهاز). */
function cleanupExamReviews(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('exam_review_')) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

interface AuthState {
  user: User | null;
  levels: LevelTier[];
  examResults: ExamResultSummary[];
  stats: StudentStats | null;
  loading: boolean;
  /** خطأ شبكة/خادم مؤقت — نقف على شاشة إعادة اتصال بدل صفحة الدخول ولا نمسح التوكن. */
  offline: boolean;
  applyUser: (u: User | null, s: StudentStats | null) => void;
  applyMe: (me: MeResponse) => Promise<void>;
  runBoot: () => Promise<void>;
  /** إعادة محاولة الاتصال بعد انقطاع مؤقت. */
  reconnect: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, grade: string, password: string) => Promise<{ user: User }>;
  logout: () => Promise<void>;
  /** يُحدِّث نتيجة امتحان محلياً (بعد التسليم) ويعيد حساب الإحصائيات فوراً. */
  applyExamResult: (r: ExamResultSummary) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  levels: [],
  examResults: [],
  stats: null,
  loading: true,
  offline: false,

  applyUser: (u, s) => set({ user: u, stats: s }),

  /**
   * تطبيق جلسة صحيحة: يصفّر `loading` فوراً (وإلا علقت كل الصفحات المحمية في سبينر)
   * ثم يحمّل المحتوى ويعيد حساب الإحصائيات في الخلفية دون حجب الواجهة.
   */
  applyMe: async (me) => {
    clearAuthFail();
    set({ offline: false, user: me.user, levels: me.levels, examResults: me.examResults, loading: false });
    void (async () => {
      try {
        await loadBootstrap(me.user.id);
      } catch {
        return; // المحتوى يبقى فاضي/قديم — الجلسة سليمة
      }
      // لا نكتب الإحصائيات إذا غادر المستخدم الصفحة (تسجيل خروج) أثناء التحميل.
      if (useAuthStore.getState().user?.id !== me.user.id) return;
      const stats =
        me.user.role === 'admin' || me.user.subscription
          ? statsFor(me.user, me.levels, me.examResults)
          : emptyStats(me.levels);
      set({ stats });
    })();
  },

  runBoot: async () => {
    // الجلسة كلها في كوكي HttpOnly (dr_code_token) يصدره الـ Edge function — لا نحتاج أي توكن محلي.
    set({ loading: true });
    try {
      const me = await api<MeResponse>('/api/auth/me');
      await get().applyMe(me);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;

      // خطأ شبكة/خادم مؤقت (0 أو 5xx) - نظهر حالة إعادة اتصال
      if (status === 0 || status >= 500) {
        recordAuthFailure(status, null);
        set({ offline: true, loading: false });
        return;
      }

      // جلسة مرفوضة نهائياً (401 منتهي/غير صالح، 403 محظور، 404 محذوف).
      // نُبقي سجل التشخيص (لا clearAuthFail) ليقرأه صفحة الدخول ويعرض السبب الحقيقي.
      if (status === 401 || status === 403 || status === 404) {
        recordAuthFailure(status, null);
        set({ offline: false, user: null, stats: null, examResults: [], levels: [], loading: false });
        return;
      }

      // حالات أخرى غير متوقعة
      recordAuthFailure(status, null);
      set({ offline: false, loading: false });
    }
  },

  reconnect: async () => {
    set({ loading: true, offline: false });
    // محاولة إعادة الاتصال مع إعادة محاولات
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        await get().runBoot();
        // إذا نجح runBoot ولم يعد في حالة offline، نكون انتهينا
        if (!useAuthStore.getState().offline) {
          return;
        }
      } catch {
        // تجاهل الخطأ، runBoot يتعامل معه
      }
      attempts++;
      if (attempts < maxAttempts) {
        // انتظار قبل المحاولة التالية: 1s, 2s, 3s
        await new Promise(r => setTimeout(r, attempts * 1000));
      }
    }
  },

  login: async (identifier, password) => {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    clearAuthFail();
    try {
      const me = await api<MeResponse>('/api/auth/me');
      await get().applyMe(me);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401 || status === 403 || status === 404) {
        // الجلسة مُرفوضة حقيقةً رغم نجاح الدخول → نعيد الخطأ.
        recordAuthFailure(status, null);
        throw err;
      }
      // انقطاع مؤقت بعد نجاح الدخول: لا نطرد المستخدم
      recordAuthFailure(status, null);
      set({ offline: status >= 500 || status === 0 });
      await get().applyMe({ user: data.user, levels: [], examResults: [] } as MeResponse);
    }
  },

  register: async (fullName, phone, grade, password) => {
    const data = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, phone, grade, password }),
    });
    clearAuthFail();
    set({ user: data.user, stats: null, loading: false });
    return { user: data.user };
  },

  logout: async () => {
    // الجلسة في كوكي HttpOnly لا يستطيع JS قراءته — الطريقة الوحيدة لإبطاله هي نداء الخادم.
    // best-effort: حتى لو فشل الطلب (انقطاع) نُنهي الجلسة محلياً ولا نُبقي المستخدم عالقاً.
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* الكوكي قد يبقى صالحاً — نمسح الحالة المحلية على أي حال */
    }
    clearAuthFail();
    cleanupExamReviews();
    clearBootstrapCache(get().user?.id ?? null);
    set({ user: null, stats: null, examResults: [], levels: [], offline: false, loading: false });
  },

  applyExamResult: (r) => {
    const prev = get().examResults;
    const next = [...prev.filter((x) => x.examId !== r.examId), r].sort((a, b) => a.examId - b.examId);
    set({ examResults: next });
    const u = get().user;
    if (u) set({ stats: statsFor(u, get().levels, next) });
  },
}));

/** هوية المستخدم فقط — لا تُعيد التصيير عند تغير النتائج/الإحصائيات. */
export function useUser(): User | null {
  return useAuthStore((s) => s.user);
}

/** شريحة الجلسة (الهوية + أفعال المصادقة) معزولة عن شريحة البيانات. */
export function useSession(): {
  user: User | null;
  loading: boolean;
  offline: boolean;
  reconnect: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, grade: string, password: string) => Promise<{ user: User }>;
  logout: () => Promise<void>;
} {
  return useAuthStore(
    useShallow((s) => ({
      user: s.user,
      loading: s.loading,
      offline: s.offline,
      reconnect: s.reconnect,
      login: s.login,
      register: s.register,
      logout: s.logout,
    }))
  );
}

/** شريحة البيانات المتقلّبة (إحصائيات + نتائج امتحانات) — معزولة عن الهوية. */
export function useProgress(): {
  stats: StudentStats | null;
  examResults: ExamResultSummary[];
  applyExamResult: (r: ExamResultSummary) => void;
} {
  return useAuthStore(
    useShallow((s) => ({
      stats: s.stats,
      examResults: s.examResults,
      applyExamResult: s.applyExamResult,
    }))
  );
}