import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken, clearToken, getToken } from '../api/client';

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

export interface StudentStats {
  examAvg: number;
  watchRatio: number;
  points: number;
  level: { min: number; key: string; name: string; nameEn: string };
  completedLessons: number;
  totalLessons: number;
  examsTaken: number;
  totalExams: number;
}

interface AuthContextValue {
  user: User | null;
  stats: StudentStats | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, grade: string, password: string) => Promise<{ user: User }>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = (u: User, s: StudentStats | null) => {
    setUser(u);
    setStats(s);
  };

  useEffect(() => {
    const boot = async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await api<{ user: User; stats: StudentStats }>('/api/auth/me');
        applyUser(data.user, data.stats);
      } catch {
        clearToken();
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
    applyUser(data.user, null);
    const me = await api<{ user: User; stats: StudentStats }>('/api/auth/me');
    applyUser(me.user, me.stats);
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

  const logout = () => {
    clearToken();
    setUser(null);
    setStats(null);
  };

  const refresh = async () => {
    if (!getToken()) return;
    const me = await api<{ user: User; stats: StudentStats }>('/api/auth/me');
    applyUser(me.user, me.stats);
  };

  return (
    <AuthContext.Provider value={{ user, stats, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
