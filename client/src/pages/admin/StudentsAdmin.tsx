import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import ModalContent from '../../components/ModalContent';
import StudentTable from '../../components/StudentTable';
import StudentHeader from '../../components/StudentHeader';
import StudentContent from '../../components/StudentContent';
import StudentPagination from '../../components/StudentPagination';
import ResetPanel from '../../components/ResetPanel';
import LevelBadge from '../../components/LevelBadge';
import ExamScores from '../../components/ExamScores';

const PAGE_SIZE = 25;
const CACHE_KEY = 'dr_admin_students_cache';
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_VERSION = 2;
const PANEL_ID = 0;
const RESETS_ID = 'resets';
const WA_DEDUP_KEY = 'dr_admin_wa_dedup';
const WA_DEDUP_TTL = 24 * 60 * 60 * 1000;

const EGYPT_CODE = '20';

/**
 * يحوّل رقم الهاتف إلى الصيغة الدولية التي يقبلها wa.me.
 *
 * كان الخطأ هنا يضيف الرقم '2' بدل كود الدولة '20'، فكان
 * 01068633486 يتحول إلى 21068633486 بدل 201068633486،
 * وواتساب يرد "لا يوجد مثل هذا الرقم". الدالة الآن idempotent:
 * تشغيلها مرتين يعطي نفس النتيجة.
 */
function toWhatsappNumber(p: string): string {
  let v = String(p ?? '').replace(/\D/g, '');
  if (!v) return '';

  if (v.startsWith('00')) v = v.slice(2); // 002010… => 2010…
  if (v.startsWith(EGYPT_CODE)) return v; // 2010… => جاهزة

  if (v.startsWith('0')) v = v.slice(1); // 010… => 10…
  return v.startsWith(EGYPT_CODE) ? v : EGYPT_CODE + v;
}

/** مصر: 20 + (10 أرقام للموبايل أو أرقام أرضي) = 11-13 رقماً. */
function isValidWaNumber(wa: string): boolean {
  return /^20\d{9,11}$/.test(wa);
}

/** رابط واتساب جاهز، أو null إن كان الرقم غير صالح. */
function buildWaUrl(phone: string, message: string): string | null {
  const wa = toWhatsappNumber(phone);
  if (!isValidWaNumber(wa)) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}

/**
 * يفتح واتساب. لازم تُستدعى مباشرة من الحدث قبل أي await،
 * لأن المتصفحات ترفض window.open بعد失去 user gesture وتحجبه كـ popup.
 */
function launchWa(url: string): boolean {
  const win = window.open(url, '_blank');
  if (win) {
    win.focus?.();
    return true;
  }
  window.location.href = url; // المتصفح حجب النوافذ ⇒ ننتقل في نفس التبويب
  return false;
}

interface Student {
  id: number;
  fullName: string;
  phone: string;
  grade: string;
  gradeName: string;
  role: 'student' | 'admin';
  points: number;
  level: { key: string; name: string; nameEn: string };
  examAvg: number;
  completedLessons: number;
  totalLessons: number;
  examsTaken: number;
  examScores: { examId: number; at: number; score: number }[];
  subscription: boolean;
  blocked: boolean;
  createdAt: number;
}

interface Detail {
  user: any;
  stats: any;
  progress: any[];
  results: any[];
  codeFiles: { id: number; name: string; language: string; updatedAt: number }[];
}

interface PasswordRequest {
  id: number;
  userId: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  createdAt: number;
  updatedAt: number;
  fullName: string;
  phone: string;
}

interface ResetDiag {
  total: number;
  byStatus: Record<string, number>;
  lastRequestAt: number | null;
  today: string;
  todayUnmatched: number;
}

const RESET_STATUS_KEYS: Record<PasswordRequest['status'], string> = {
  pending: 'admin.resetRequestPending',
  approved: 'admin.resetRequestApproved',
  completed: 'admin.resetRequestCompleted',
  rejected: 'admin.resetRequestRejected',
};

const FILTERS = [
  { key: 'all', tKey: 'admin.filterAll' },
  { key: 'subscribed', tKey: 'admin.filterSubscribed' },
  { key: 'unsubscribed', tKey: 'admin.filterUnsubscribed' },
  { key: 'blocked', tKey: 'admin.filterBlocked' },
] as const;

const GRADES = [
  { key: 'all', tKey: 'admin.gradeAll' },
  { key: 'bac1', tKey: 'auth.bac1' },
  { key: 'bac2', tKey: 'auth.bac2' },
];

function readCache(): Student[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.users)) return null;
    if (typeof parsed.at !== 'number' || parsed.at <= 0) return null;
    if (typeof parsed.v !== 'number' || parsed.v !== CACHE_VERSION) return null;
    if (!parsed.users.every((u: any) => u && typeof u.id === 'number' && typeof u.fullName === 'string')) {
      return null;
    }
    if (Date.now() - parsed.at > CACHE_TTL) return null;
    return parsed.users as Student[];
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    return null;
  }
}

function writeCache(users: Student[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, at: Date.now(), users }));
  } catch {
    /* ignore */
  }
}

function ago(ms: number): string {
  const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (min < 1) return 'الآن';
  if (min < 60) return `منذ ${min} دقيقة`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  return `منذ ${Math.floor(hrs / 24)} يوم`;
}

function wasWaSentRecently(phone: string): boolean {
  try {
    const raw = localStorage.getItem(WA_DEDUP_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const normalizedPhone = toWhatsappNumber(phone);
    const entry = data[normalizedPhone];
    if (!entry) return false;
    return Date.now() - entry.sentAt < WA_DEDUP_TTL;
  } catch {
    return false;
  }
}

function markWaSent(phone: string): void {
  try {
    const raw = localStorage.getItem(WA_DEDUP_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const normalizedPhone = toWhatsappNumber(phone);
    data[normalizedPhone] = { sentAt: Date.now() };
    localStorage.setItem(WA_DEDUP_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export default function StudentsAdmin() {
  const { t } = useLang();
  const [allUsers, setAllUsers] = useState<Student[]>(() => readCache() ?? []);
  const [loading, setLoading] = useState(allUsers.length === 0);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<'all' | 'subscribed' | 'unsubscribed' | 'blocked'>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [grade, setGrade] = useState('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState('');
  const [resetRequests, setResetRequests] = useState<PasswordRequest[]>([]);
  const [showResetPanel, setShowResetPanel] = useState(false);
  const [resetDiag, setResetDiag] = useState<ResetDiag | null>(null);
  const mountedRef = useRef(true);
  const activeOpsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeOpsRef.current.forEach(key => setBusy((b) => ({ ...b, [key]: false })));
      activeOpsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setAllUsers(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api<{ users: Student[] }>('/api/admin/users/all?limit=500')
      .then((d) => {
        if (cancelled) return;
        setAllUsers(d.users);
        writeCache(d.users);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    loadResetRequests();
    loadResetDiag();
  }, []);

  useEffect(() => {
    if (!showResetPanel) return;
    const id = setInterval(() => {
      loadResetRequests();
      loadResetDiag();
    }, 20000);
    return () => clearInterval(id);
  }, [showResetPanel]);

  const counts = useMemo(() => {
    const gradeMatch = grade === 'all' ? allUsers : allUsers.filter((s) => s.grade === grade);
    return {
      all: gradeMatch.length,
      subscribed: gradeMatch.filter((s) => s.role === 'student' && s.subscription).length,
      unsubscribed: gradeMatch.filter((s) => s.role === 'student' && !s.subscription).length,
      blocked: gradeMatch.filter((s) => s.blocked).length,
    };
  }, [allUsers, grade]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return allUsers.filter((s) => {
      if (grade !== 'all' && s.grade !== grade) return false;
      if (filter === 'subscribed' && !(s.role === 'student' && s.subscription)) return false;
      if (filter === 'unsubscribed' && !(s.role === 'student' && !s.subscription)) return false;
      if (filter === 'blocked' && !s.blocked) return false;
      if (q) {
        const name = (s.fullName || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [allUsers, filter, grade, debouncedQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(t);
  }, [success]);

  const refresh = () => {
    run(PANEL_ID, 'refresh', () => api<{ users: Student[] }>('/api/admin/users/all?limit=500'), (d) => {
      setAllUsers(d.users);
      writeCache(d.users);
    });
  };

  const patchStudent = (id: number, patch: Partial<Student>) => {
    setAllUsers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      writeCache(next);
      return next;
    });
  };

  const run = async (
    id: string | number,
    action: string,
    fn: () => Promise<unknown>,
    onOk?: (d: any) => void | Promise<void>,
    optimisticUpdate?: () => void
  ) => {
    const key = `${id}:${action}`;
    activeOpsRef.current.add(key);
    if (busy[key]) return;
    setSuccess('');
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const d = await fn();
      if (mountedRef.current) await onOk?.(d);
      if (mountedRef.current) setSuccess(t('common.success'));
    } catch (e) {
      if (mountedRef.current) {
        setError((e as Error).message);
        const cached = readCache();
        if (cached) setAllUsers(cached);
      }
    } finally {
      if (mountedRef.current) setBusy((b) => ({ ...b, [key]: false }));
      activeOpsRef.current.delete(key);
    }
  };

  const toggleRole = (s: Student) =>
    run(s.id, 'role', () => api(`/api/admin/users/${s.id}/role`, { method: 'PUT', body: JSON.stringify({ role: s.role === 'admin' ? 'student' : 'admin' }) }), () => {
      patchStudent(s.id, { role: s.role === 'admin' ? 'student' : 'admin' });
    }, () => {
      patchStudent(s.id, { role: s.role === 'admin' ? 'student' : 'admin' });
    });

  const toggleBlock = (s: Student) =>
    run(s.id, 'block', () => api(`/api/admin/users/${s.id}/block`, { method: 'PUT', body: JSON.stringify({ blocked: !s.blocked }) }), () => {
      patchStudent(s.id, { blocked: !s.blocked });
    }, () => {
      patchStudent(s.id, { blocked: !s.blocked });
    });

  const toggleSubscription = async (s: Student) => {
    const activating = !s.subscription;
    const name = s.fullName || '';
    await run(s.id, 'sub', () => api(`/api/admin/users/${s.id}/subscription`, { method: 'PUT', body: JSON.stringify({ subscription: activating }) }), async () => {
      patchStudent(s.id, { subscription: activating });
      if (activating) {
        const msg = t('admin.notifyWaMessage', { name });
        openWaForMessage(s.phone, msg);
      }
    }, () => {
      patchStudent(s.id, { subscription: activating });
    });
  };

  const deleteStudent = (s: Student) => {
    if (!window.confirm(t('admin.deleteAccountConfirm'))) return;
    run(s.id, 'delete', async () => {
      await api(`/api/admin/users/${s.id}`, { method: 'DELETE' });
    }, () => {
      setAllUsers((prev) => {
        const next = prev.filter((x) => x.id !== s.id);
        writeCache(next);
        return next;
      });
      if (detail?.user?.id === s.id) setDetail(null);
    });
  };

  const openDetail = (id: number) =>
    run(id, 'detail', async () => {
      const d = await api<Detail>(`/api/admin/users/${id}`);
      setDetail(d);
    });

  const openWaForMessage = (phone: string, message: string) => {
    const wa = toWhatsappNumber(phone);
    if (!/^\d{10,15}$/.test(wa)) {
      setError(t('admin.invalidWhatsapp'));
      return;
    }
    if (wasWaSentRecently(phone)) {
      setSuccess(t('admin.waAlreadySent'));
      return;
    }
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(message)}`, '_blank');
    markWaSent(phone);
  };

  const loadResetRequests = () =>
    run(RESETS_ID, 'resets', async () => {
      const d = await api<{ requests: PasswordRequest[] }>('/api/admin/password-resets');
      return d.requests;
    }, (requests) => {
      setResetRequests(requests);
    });

  const loadResetDiag = async () => {
    try {
      const d = await api<ResetDiag>('/api/admin/password-resets/diagnose');
      if (mountedRef.current) setResetDiag(d);
    } catch {
      if (mountedRef.current) setResetDiag(null);
    }
  };

  const approveReset = (r: PasswordRequest) => {
    if (!window.confirm(t('admin.resetApproveConfirm'))) return;
    run(r.id, 'reset-approve', async () => {
      const d = await api<{ ok: boolean; fullName: string; phone: string; code?: string }>(`/api/admin/password-resets/${r.id}/approve`, { method: 'POST' });
      const msg = t('admin.resetApproveWaMessage', { name: d.fullName || '', code: d.code || '' });
      openWaForMessage(d.phone || r.phone, msg);
      if (d.code) setSuccess(`${t('admin.resetApproveSuccess')} — ${t('admin.resetApproveCode', { code: d.code })}`);
      else setSuccess(t('admin.resetApproveSuccess'));
      return d;
    }, async () => {
      await loadResetRequests();
    });
  };

  const rejectReset = (r: PasswordRequest) => {
    if (!window.confirm(t('admin.resetRejectConfirm'))) return;
    run(r.id, 'reset-reject', async () => {
      await api(`/api/admin/password-resets/${r.id}/reject`, { method: 'POST' });
      setSuccess(t('admin.resetRequestRejected'));
    }, async () => {
      await loadResetRequests();
    });
  };

  const changeQuery = (v: string) => {
    setQuery(v);
    setPage(1);
  };

  const changeGrade = (v: string) => {
    setGrade(v);
    setPage(1);
  };

  const changeFilter = (k: 'all' | 'subscribed' | 'unsubscribed' | 'blocked') => {
    setFilter(k);
    setPage(1);
  };

  const isBusy = (id: number, action: string) => !!busy[`${id}:${action}`];

  const statusBadge = (s: Student) => {
    if (s.blocked)
      return <span className="rounded-full bg-fire-500/20 px-2.5 py-0.5 text-xs font-bold text-fire-300 transition-colors">🚫 {t('admin.blocked')}</span>;
    if (s.subscription)
      return <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 transition-colors">✓ {t('admin.subscribed')}</span>;
    return <span className="rounded-full bg-ink-600/40 px-2.5 py-0.5 text-xs font-bold text-gray-400">— {t('admin.notSubscribed')}</span>;
  };

  return (
    <div className="space-y-5">
      <StudentHeader
        filteredLength={filtered.length}
        onRefresh={refresh}
        isRefreshing={isBusy(PANEL_ID, 'refresh')}
        showResetPanel={showResetPanel}
        onToggleResetPanel={() => setShowResetPanel((v) => !v)}
        onToggleResetPanelLoad={loadResetRequests}
        pendingResetCount={resetRequests.filter((r) => r.status === 'pending').length}
        currentFilter={filter}
        onChangeFilter={changeFilter}
        filterCounts={counts}
        t={t}
        isResetsLoading={false}
      />

      {showResetPanel && (
        <ResetPanel
          resetRequests={resetRequests}
          resetDiag={resetDiag}
          isBusy={isBusy}
          onLoadResetRequests={loadResetRequests}
          onApproveReset={approveReset}
          onRejectReset={rejectReset}
          t={t}
          RESET_STATUS_KEYS={RESET_STATUS_KEYS}
          ago={ago}
        />
      )}

      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder={t('admin.searchStudents')}
            className="input-fire w-full rounded-xl py-2.5 pe-10 ps-10 text-sm"
          />
        </div>
        <select
          value={grade}
          onChange={(e) => changeGrade(e.target.value)}
          className="input-fire rounded-xl px-3.5 py-2.5 text-sm w-full sm:w-auto"
        >
          {GRADES.map((g) => (
            <option key={g.key} value={g.key}>
              {t(g.tKey)}
            </option>
          ))}
        </select>
        <span className="rounded-full bg-ink-800 px-3.5 py-1.5 text-xs font-bold text-fire-300 flex items-center justify-center w-full sm:w-auto">
          {t('admin.resultsCount', { count: paged.length, total: filtered.length })}
        </span>
      </div>

      {loading && allUsers.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-1 text-sm text-gray-400">
          <Spinner className="h-4 w-4 text-fire-400" />
          <span>{t('common.loading')}</span>
        </div>
      )}

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {success && <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300" onClick={() => setSuccess('')}>{success}</div>}

      {loading && allUsers.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
          <Spinner className="h-8 w-8 border-[3px] text-fire-400" />
          <span>{t('common.loading')}</span>
        </div>
      ) : paged.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noStudents')}</p>
      ) : (
        <StudentTable
          students={paged}
          isBusy={isBusy}
          onToggleSubscription={toggleSubscription}
          onToggleBlock={toggleBlock}
          onToggleRole={toggleRole}
          onDelete={deleteStudent}
          onOpenDetail={openDetail}
        />
      )}

      <StudentPagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.user.fullName : ''}>
        {detail && (
          <ModalContent
            detail={detail}
            t={t}
            statusBadge={statusBadge}
            Info={Info}
          />
        )}
      </Modal>
    </div>
  );
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-900 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}