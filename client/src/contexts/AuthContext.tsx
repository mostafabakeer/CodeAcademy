import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, setToken, ApiError } from '../api/client';
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
  login: (identifier: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, grade: string, password: string) => Promise<{ user: User }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** يُحدِّث نتيجة امتحان محلياً (بعد التسليم) ويعيد حساب الإحصائيات فوراً. */
  applyExamResult: (r: ExamResultSummary) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [levels, setLevels] = useState<LevelTier[]>([]);
  const [examResults, setExamResults] = useState<ExamResultSummary[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = (u: User | null, s: StudentStats | null) => {
    setUser(u);
    setStats(s);
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const me = await api<MeResponse>('/api/auth/me');
        setUser(me.user);
        setLevels(me.levels);
        setExamResults(me.examResults);
        if (me.user.role === 'admin' || me.user.subscription) {
          await loadBootstrap(me.user.id);
          setStats(statsFor(me.user, me.levels, me.examResults));
        } else {
          setStats(emptyStats(me.levels));
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) clearToken();
        applyUser(null, null);
      }
      setLoading(false);
    };
    boot();
  }, []);

  const login = async (identifier: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setToken(data.token);
    const me = await api<MeResponse>('/api/auth/me');
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

  const register = async (fullName: string, phone: string, grade: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, phone, grade, password }),
    });
    setToken(data.token);
    applyUser(data.user, null);
    return { user: data.user };
  };

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* الكوكيز تُمسح محلياً حتى لو فشل الخادم */
    }
    clearToken();
    setUser(null);
    setStats(null);
    setExamResults([]);
    setLevels([]);
  };

  const refresh = async () => {
    const me = await api<MeResponse>('/api/auth/me');
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

  const applyExamResult = (r: ExamResultSummary) => {
    const next = [...examResults.filter((x) => x.examId !== r.examId), r].sort((a, b) => a.examId - b.examId);
    setExamResults(next);
    if (user) setStats(statsFor(user, levels, next));
  };

  return (
    <AuthContext.Provider value={{ user, stats, examResults, loading, login, register, logout, refresh, applyExamResult }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
