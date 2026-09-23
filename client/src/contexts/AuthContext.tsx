import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, clearToken, setToken, ApiError, getToken, recordAuthFailure, clearAuthFail, markLoggedOut, clearLoggedOutFlag, getLoggedOutFlag } from '../api/client';
import { getBootstrapSync, loadBootstrap } from '../lib/content';
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

interface AuthContextValue {
  user: User | null;
  stats: StudentStats | null;
  examResults: ExamResultSummary[];
  loading: boolean;
  /** خطأ شبكة/خادم مؤقت — نقف على شاشة إعادة اتصال بدل صفحة الدخول ولا نمسح التوكن. */
  offline: boolean;
  /** إعادة محاولة الاتصال بعد انقطاع مؤقت. */
  reconnect: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, grade: string, password: string) => Promise<{ user: User }>;
  logout: () => Promise<void>;
  /** يُحدِّث نتيجة امتحان محلياً (بعد التسليم) ويعيد حساب الإحصائيات فوراً. */
  applyExamResult: (r: ExamResultSummary) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [levels, setLevels] = useState<LevelTier[]>([]);
  const [examResults, setExamResults] = useState<ExamResultSummary[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // مراجع متزامنة مع الحالة لتجنّب الإغلاق على قيم قديمة (وخاصة في applyExamResult).
  const userRef = useRef<User | null>(null);
  const levelsRef = useRef<LevelTier[]>([]);
  const examResultsRef = useRef<ExamResultSummary[]>([]);
  userRef.current = user;
  levelsRef.current = levels;
  examResultsRef.current = examResults;

  const applyUser = (u: User | null, s: StudentStats | null) => {
    setUser(u);
    setStats(s);
  };

  /** تطبيق جلسة صحيحة: تخزين التوكن (للإنعاش عبر الكوكي) + تفريغ التشخيص + ملء الحالة والإحصائيات. */
  const applyMe = async (me: MeResponse) => {
    if (me.token) setToken(me.token);
    clearLoggedOutFlag();
    clearAuthFail();
    setOffline(false);
    setUser(me.user);
    setLevels(me.levels);
    setExamResults(me.examResults);
    if (me.user.role === 'admin' || me.user.subscription) {
      await loadBootstrap(me.user.id);
      setStats(statsFor(me.user, me.levels, me.examResults));
    } else {
      setStats(emptyStats(me.levels));
    }
  };

  const runBoot = async () => {
    // بعد تسجيل خروج، لا نُحيي جلسة من الكوكي (HttpOnly لا يُمسح بالجافاسكربت).
    if (getLoggedOutFlag() && !getToken()) {
      setOffline(false);
      applyUser(null, null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<MeResponse>('/api/auth/me');
      await applyMe(me);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401) {
        // لا نمسح التوكن على 401 وحيد قد يكون عابرًا (خادم متعثر كان يقلب
        // فشل قاعدة البيانات إلى 401). نعيد المحاولة مرة واحدة قبل الحكم.
        try {
          const retry = await api<MeResponse>('/api/auth/me');
          await applyMe(retry);
          return;
        } catch (err2) {
          const s2 = err2 instanceof ApiError ? err2.status : 0;
          if (s2 === 401 || s2 === 403 || s2 === 404) {
            // تأكد: الجلسة ميتة فعلًا → مسح والذهاب لصفحة الدخول.
            recordAuthFailure(s2, getToken());
            clearToken();
            setOffline(false);
            applyUser(null, null);
          } else {
            // 0/5xx أثناء إعادة المحاولة → انقطاع مؤقت، نحافظ على التوكن.
            recordAuthFailure(s2, getToken());
            setOffline(true);
          }
          return;
        }
      }
      // لا نمسح الجلسة إلا عند جلسة ميتة نهائيًا (403 محظور / 404 مستخدم
      // محذوف). أي خطأ شبكة/خادم مؤقت (0 أو 5xx) لا يُسقط التوكن ولا يمسحه،
      // بل يُظهر آليات "إعادة الاتصال" على الصفحات المحمية فقط.
      recordAuthFailure(status, getToken());
      if (status === 403 || status === 404) {
        clearToken();
        setOffline(false);
        applyUser(null, null);
      } else if (status >= 500) {
        setOffline(true);
      } else {
        setOffline(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const bootStartedRef = useRef(false);
  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    runBoot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // مزامنة بين التبويبات: تغيّر dr_code_token في تبويب آخر → إعادة تشغيل البوت.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dr_code_token') runBoot();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconnect = async () => {
    setLoading(true);
    setOffline(false);
    await runBoot();
  };

  const login = async (identifier: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    clearLoggedOutFlag();
    setToken(data.token);
    clearAuthFail();
    try {
      const me = await api<MeResponse>('/api/auth/me');
      await applyMe(me);
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
      setOffline(status >= 500 || status === 0);
      await applyMe({ user: data.user, levels: [], examResults: [] } as MeResponse);
    }
  };

  const register = async (fullName: string, phone: string, grade: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, phone, grade, password }),
    });
    clearLoggedOutFlag();
    setToken(data.token);
    clearAuthFail();
    applyUser(data.user, null);
    return { user: data.user };
  };

  const logout = async () => {
    // العلم يمنع بعث الجلسة عبر الكوكي بعد إعادة التحميل حتى لو فشل POST.
    markLoggedOut();
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* الخادم قد يكون متوقفًا؛ المتابعة محليًا آمنة */
    }
    clearToken();
    clearAuthFail();
    cleanupExamReviews();
    setUser(null);
    setStats(null);
    setExamResults([]);
    setLevels([]);
  };

  const applyExamResult = (r: ExamResultSummary) => {
    const next = [...examResultsRef.current.filter((x) => x.examId !== r.examId), r].sort((a, b) => a.examId - b.examId);
    setExamResults(next);
    if (userRef.current) setStats(statsFor(userRef.current, levelsRef.current, next));
  };

  return (
    <AuthContext.Provider
      value={{ user, stats, examResults, loading, offline, reconnect, login, register, logout, applyExamResult }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
