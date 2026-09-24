import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useEffect, useRef } from 'react';
import { api, clearToken, setToken, ApiError, getToken, recordAuthFailure, clearAuthFail, markLoggedOut, clearLoggedOutFlag, getLoggedOutFlag } from '../api/client';
import { getBootstrapSync, loadBootstrap } from '../lib/content';
import { getAllVideoProgressLocal, getSessionSnapshot, saveSessionSnapshot, clearSessionSnapshot, type SessionSnapshot } from '../lib/localStore';
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
  /** يصدره الخادم عند المصادقة عبر الكوكي فقط (localStorage فاضي) ليعيد العميل تخزينه. */
  token?: string;
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

/** مدة بقاء لقطة الهوية المحفوظة صالحة — مطابقة لصلاحية التوكن (180 يومًا في الخادم). */
const SESSION_SNAPSHOT_TTL = 180 * 24 * 60 * 60 * 1000;

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
  restoreSession: (snap: SessionSnapshot) => void;
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

  /** تطبيق جلسة صحيحة: تخزين التوكن (للإنعاش عبر الكوكي) + تفريغ التشخيص + ملء الحالة والإحصائيات. */
  applyMe: async (me) => {
    if (me.token) setToken(me.token);
    clearLoggedOutFlag();
    clearAuthFail();
    set({ offline: false, user: me.user, levels: me.levels, examResults: me.examResults });
    saveSessionSnapshot(me.user, me.levels, me.examResults);
    // جلب المحتوى مسبقًا لكل المستخدمين (وليس المشترك/الأدمن فقط) حتى يصل الكاش
    // قبل تركيب أي صفحة — فإعادة التحميل تعرض المحتوى فورًا من النسخة المحفوظة.
    // فشل جلب المحتوى لا يعني موت الجلسة — نحتفظ بالتوكن ونكمل حتى لا يخرج
    // المستخدم من حسابه بسبب انقطاع مؤقت أو تجاوز حد الطلبات أثناء جلب المحتوى.
    try {
      await loadBootstrap(me.user.id);
    } catch {
      /* content يبقى فاضي/قديم — الجلسة سليمة */
    }
    if (me.user.role === 'admin' || me.user.subscription) {
      set({ stats: statsFor(me.user, me.levels, me.examResults) });
    } else {
      set({ stats: emptyStats(me.levels) });
    }
  },

  /** استرجاع هوية مؤكدة مسبقًا (لقطة محفوظة) كي لا يُطرد المستخدم عند فشل /me بعد إعادة التحميل. */
  restoreSession: (snap) => {
    const u = snap.user as User;
    const lv = snap.levels as LevelTier[];
    const er = snap.examResults as ExamResultSummary[];
    set({ offline: false, user: u, levels: lv, examResults: er, stats: statsFor(u, lv, er) });
  },

  runBoot: async () => {
    // بعد تسجيل خروج، لا نُحيي جلسة من الكوكي (HttpOnly لا يُمسح بالجافاسكربت).
    if (getLoggedOutFlag() && !getToken()) {
      set({ offline: false, user: null, stats: null, loading: false });
      return;
    }
    try {
      const me = await api<MeResponse>('/api/auth/me');
      await get().applyMe(me);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401) {
        // لا نمسح التوكن على 401 وحيد قد يكون عابرًا (خادم متعثر كان يقلب
        // فشل قاعدة البيانات إلى 401). نعيد المحاولة مرة واحدة قبل الحكم.
        try {
          const retry = await api<MeResponse>('/api/auth/me');
          await get().applyMe(retry);
          return;
        } catch (err2) {
          const s2 = err2 instanceof ApiError ? err2.status : 0;
          if (s2 === 401 || s2 === 403 || s2 === 404) {
            // الجلسة مرفوضة على الخادم، لكن إن كانت هوية مؤكدة مسبقًا (لقطة
            // محفوظة حديثة) فلا نُطرد المستخدم — نستعيد اللقطة ونبقي التوكن.
            // الخادم يبقى هو السلطة: أي طلب قادم سيتقبل الرفض إن كانت الجلسة
            // ميتة فعلًا، والواجهة فقط لا ترسل المستخدم لصفحة الدخول.
            recordAuthFailure(s2, getToken());
            const snap = getSessionSnapshot();
            if (snap && Date.now() - snap.at < SESSION_SNAPSHOT_TTL) {
              get().restoreSession(snap);
            } else {
              clearToken();
              set({ offline: false, user: null, stats: null });
            }
          } else {
            // 0/5xx أثناء إعادة المحاولة → انقطاع مؤقت، نحافظ على التوكن.
            recordAuthFailure(s2, getToken());
            set({ offline: true });
          }
          return;
        }
      }
      // لا نمسح الجلسة إلا عند جلسة ميتة نهائيًا (403 محظور / 404 مستخدم
      // محذوف) ولا توجد هوية مؤكدة مسبقًا. أي خطأ شبكة/خادم مؤقت (0 أو 5xx)
      // لا يُسقط التوكن ولا يمسحه، بل يُظهر آليات "إعادة الاتصال" على الصفحات
      // المحمية فقط. وعند فشل مؤكد مع وجود لقطة حديثة، تُستعاد الهوية ولا
      // يُطرد المستخدم (تلبيةً لطلب "بمجرد ما أكد الهوية خلاص").
      recordAuthFailure(status, getToken());
      if (status === 403 || status === 404) {
        const snap = getSessionSnapshot();
        if (snap && Date.now() - snap.at < SESSION_SNAPSHOT_TTL) {
          get().restoreSession(snap);
        } else {
          clearToken();
          set({ offline: false, user: null, stats: null });
        }
      } else if (status >= 500) {
        set({ offline: true });
      } else {
        set({ offline: false });
      }
    } finally {
      set({ loading: false });
    }
  },

  reconnect: async () => {
    set({ loading: true, offline: false });
    await get().runBoot();
  },

  login: async (identifier, password) => {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    clearLoggedOutFlag();
    setToken(data.token);
    clearAuthFail();
    try {
      const me = await api<MeResponse>('/api/auth/me');
      await get().applyMe(me);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401 || status === 403 || status === 404) {
        // الجلسة مُرفوضة حقيقةً رغم نجاح الدخول → نمسح ونعيد الخطأ.
        recordAuthFailure(status, getToken());
        clearToken();
        throw err;
      }
      // انقطاع مؤقت بعد نجاح الدخول: لا نطرد المستخدم، نُنهي الجلسة بالبيانات
      // التي عادت من /login (بدون مستويات/نتائج — تُجلب عند أول /me ناجح).
      recordAuthFailure(status, getToken());
      set({ offline: status >= 500 || status === 0 });
      await get().applyMe({ user: data.user, levels: [], examResults: [] } as MeResponse);
    }
  },

  register: async (fullName, phone, grade, password) => {
    const data = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, phone, grade, password }),
    });
    clearLoggedOutFlag();
    setToken(data.token);
    clearAuthFail();
    saveSessionSnapshot(data.user, [], []);
    set({ user: data.user, stats: null });
    return { user: data.user };
  },

  logout: async () => {
    // العلم يمنع بعث الجلسة عبر الكوكي بعد إعادة التحميل حتى لو فشل POST.
    markLoggedOut();
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* الخادم قد يكون متوقفًا؛ المتابعة محليًا آمنة */
    }
    clearToken();
    clearAuthFail();
    clearSessionSnapshot();
    cleanupExamReviews();
    set({ user: null, stats: null, examResults: [], levels: [] });
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

/** تشغيل البوت مرة واحدة + مزامنة تغيّر التوكن بين التبويبات. */
function useAuthBoot(): void {
  const bootStartedRef = useRef(false);
  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    void useAuthStore.getState().runBoot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dr_code_token') void useAuthStore.getState().runBoot();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** واجهة هامدة تُركّب عند الإقلاع لبدء الجلسة (يحل محل AuthProvider). */
export function AuthBootstrap() {
  useAuthBoot();
  return null;
}