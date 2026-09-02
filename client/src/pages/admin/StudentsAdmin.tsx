import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import LevelBadge from '../../components/LevelBadge';

const PAGE_SIZE = 25;
const CACHE_KEY = 'dr_admin_students_cache';
const CACHE_TTL = 5 * 60 * 1000;

/** تحويل رقم محلي (01xxxxxxxxx) إلى صيغة واتساب الدولية (201xxxxxxxxx). */
function toWhatsappNumber(p: string): string {
  let v = String(p ?? '').replace(/[\s()+-]/g, '');
  if (v.startsWith('00')) v = v.slice(2);
  if (v.startsWith('0')) v = v.slice(1);
  if (!v.startsWith('2')) v = '2' + v;
  return v;
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

const RESET_STATUS_KEYS: Record<PasswordRequest['status'], string> = {
  pending: 'admin.resetRequestPending',
  approved: 'admin.resetRequestApproved',
  completed: 'admin.resetRequestCompleted',
  rejected: 'admin.resetRequestRejected',
};

type Filter = 'all' | 'subscribed' | 'unsubscribed' | 'blocked';

const FILTERS: { key: Filter; tKey: string }[] = [
  { key: 'all', tKey: 'admin.filterAll' },
  { key: 'subscribed', tKey: 'admin.filterSubscribed' },
  { key: 'unsubscribed', tKey: 'admin.filterUnsubscribed' },
  { key: 'blocked', tKey: 'admin.filterBlocked' },
];

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
    if (!Array.isArray(parsed?.users) || typeof parsed?.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL) return null;
    return parsed.users as Student[];
  } catch {
    return null;
  }
}

function writeCache(users: Student[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), users }));
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
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [grade, setGrade] = useState('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState('');
  const [resetRequests, setResetRequests] = useState<PasswordRequest[]>([]);
  const [showResetPanel, setShowResetPanel] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
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
    api<{ users: Student[] }>('/api/admin/users/all')
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
    return () => {
      cancelled = true;
    };
  }, []);

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
    setLoading(true);
    setError('');
    api<{ users: Student[] }>('/api/admin/users/all')
      .then((d) => {
        setAllUsers(d.users);
        writeCache(d.users);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  const patchStudent = (id: number, patch: Partial<Student>) => {
    setAllUsers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      writeCache(next);
      return next;
    });
  };

  const run = async (id: number, action: string, fn: () => Promise<unknown>, onOk?: () => void | Promise<void>) => {
    const key = `${id}:${action}`;
    if (busy[key]) return;
    setSuccess('');
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await fn();
      await onOk?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const toggleRole = (s: Student) =>
    run(s.id, 'role', () => api(`/api/admin/users/${s.id}/role`, { method: 'PUT', body: JSON.stringify({ role: s.role === 'admin' ? 'student' : 'admin' }) }), () => {
      patchStudent(s.id, { role: s.role === 'admin' ? 'student' : 'admin' });
    });

  const toggleBlock = (s: Student) =>
    run(s.id, 'block', () => api(`/api/admin/users/${s.id}/block`, { method: 'PUT', body: JSON.stringify({ blocked: !s.blocked }) }), () => {
      patchStudent(s.id, { blocked: !s.blocked });
    });

  const toggleSubscription = async (s: Student) => {
    const activating = !s.subscription;
    const name = s.fullName || '';
    await run(s.id, 'sub', () => api(`/api/admin/users/${s.id}/subscription`, { method: 'PUT', body: JSON.stringify({ subscription: activating }) }), async () => {
      patchStudent(s.id, { subscription: activating });
      // عند التفعيل فقط: افتح واتساب الطالب برسالة "تم تفعيل المنصة".
      if (activating) {
        const msg = t('admin.notifyWaMessage', { name });
        openWaForMessage(s.phone, msg);
      }
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
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const loadResetRequests = () =>
    run(0, 'resets', async () => {
      const d = await api<{ requests: PasswordRequest[] }>('/api/admin/password-resets');
      setResetRequests(d.requests);
    });

  const approveReset = (r: PasswordRequest) => {
    if (!window.confirm(t('admin.resetApproveConfirm'))) return;
    run(r.id, 'approve', async () => {
      const d = await api<{ ok: boolean; fullName: string; phone: string }>(`/api/admin/password-resets/${r.id}/approve`, { method: 'POST' });
      const msg = t('admin.resetApproveWaMessage', { name: d.fullName || '' });
      openWaForMessage(d.phone || r.phone, msg);
      setSuccess(t('admin.resetApproveSuccess'));
      await loadResetRequests();
    });
  };

  const rejectReset = (r: PasswordRequest) => {
    if (!window.confirm(t('admin.resetRejectConfirm'))) return;
    run(r.id, 'reject', async () => {
      await api(`/api/admin/password-resets/${r.id}/reject`, { method: 'POST' });
      setSuccess(t('admin.resetRequestRejected'));
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

  const changeFilter = (k: Filter) => {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          👨‍🎓 {t('admin.studentsList')}{' '}
          <span className="text-base font-bold text-fire-400">({filtered.length})</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-ghost-fire inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Spinner /> : '🔄'}
            {t('admin.refresh')}
          </button>
          <button
            onClick={() => {
              setShowResetPanel((v) => !v);
              if (!showResetPanel) loadResetRequests();
            }}
            className="btn-ghost-fire inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
          >
            🔑 {t('admin.resetListTitle')}
            {resetRequests.filter((r) => r.status === 'pending').length > 0 && (
              <span className="rounded-full bg-fire-500/30 px-1.5 py-0.5 text-[10px] font-black text-fire-100">
                {resetRequests.filter((r) => r.status === 'pending').length}
              </span>
            )}
          </button>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => changeFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filter === f.key ? 'bg-fire-500/20 text-fire-300 ring-1 ring-fire-500/40' : 'bg-ink-800 text-gray-400 hover:text-white'
              }`}
            >
              {t(f.tKey)}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${filter === f.key ? 'bg-fire-500/30 text-fire-100' : 'bg-ink-700 text-gray-300'}`}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showResetPanel && (
        <div className="card-fire overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
            <h2 className="text-base font-black">🔑 {t('admin.resetListTitle')}</h2>
            <button
              onClick={() => loadResetRequests()}
              disabled={isBusy(0, 'resets')}
              className="btn-ghost-fire inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-60"
            >
              {isBusy(0, 'resets') ? <Spinner /> : '🔄'}
              {t('admin.resetRefresh')}
            </button>
          </div>
          <div className="overflow-x-auto">
            {resetRequests.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">{t('admin.resetPasswordEmpty')}</p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink-600 text-start text-gray-400">
                    <th className="px-4 py-2.5 text-start">{t('admin.resetStudent')}</th>
                    <th className="px-4 py-2.5 text-start">{t('admin.resetPhone')}</th>
                    <th className="px-4 py-2.5 text-start">{t('admin.resetStatus')}</th>
                    <th className="px-4 py-2.5 text-start">{t('admin.resetRequestDate')}</th>
                    <th className="px-4 py-2.5 text-end">{t('admin.resetActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {resetRequests.map((r) => (
                    <tr key={r.id} className="border-b border-ink-800">
                      <td className="px-4 py-2.5 font-bold">{r.fullName}</td>
                      <td className="px-4 py-2.5" dir="ltr">{r.phone}</td>
                      <td className="px-4 py-2.5">
                        {r.status === 'pending' ? (
                          <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">{t(RESET_STATUS_KEYS.pending)}</span>
                        ) : r.status === 'approved' ? (
                          <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-300">{t(RESET_STATUS_KEYS.approved)}</span>
                        ) : r.status === 'completed' ? (
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">{t(RESET_STATUS_KEYS.completed)}</span>
                        ) : (
                          <span className="rounded-full bg-fire-500/20 px-2.5 py-0.5 text-xs font-bold text-fire-300">{t(RESET_STATUS_KEYS.rejected)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {(r.status === 'pending' || r.status === 'rejected') && (
                            <button
                              onClick={() => approveReset(r)}
                              disabled={isBusy(r.id, 'approve')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60"
                            >
                              {isBusy(r.id, 'approve') ? <Spinner /> : '✓'}
                              {t('admin.resetApprove')}
                            </button>
                          )}
                          {r.status === 'pending' && (
                            <button
                              onClick={() => rejectReset(r)}
                              disabled={isBusy(r.id, 'reject')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-fire-950/60 px-2.5 py-1 text-xs font-bold text-fire-300 hover:bg-fire-600/30 disabled:opacity-60"
                            >
                              {isBusy(r.id, 'reject') ? <Spinner /> : '✕'}
                              {t('admin.resetReject')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
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
          className="input-fire rounded-xl px-3.5 py-2.5 text-sm"
        >
          {GRADES.map((g) => (
            <option key={g.key} value={g.key}>
              {t(g.tKey)}
            </option>
          ))}
        </select>
        <span className="rounded-full bg-ink-800 px-3.5 py-1.5 text-xs font-bold text-fire-300">
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
        <div className="card-fire overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-ink-600 text-start text-gray-400">
                <th className="px-4 py-3 text-start">{t('profile.fullName')}</th>
                <th className="px-4 py-3 text-start">{t('profile.phone')}</th>
                <th className="px-4 py-3 text-start">{t('profile.grade')}</th>
                <th className="px-4 py-3 text-start">{t('admin.level')}</th>
                <th className="px-4 py-3 text-start">{t('admin.examScoresLabel')}</th>
                <th className="px-4 py-3 text-start">{t('admin.status')}</th>
                <th className="px-4 py-3 text-start">{t('admin.role')}</th>
                <th className="px-4 py-3 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s, i) => (
                <motion.tr key={s.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 120, damping: 15, delay: i * 0.02 }} className="border-b border-ink-800 hover:bg-ink-850">
                  <td className="px-4 py-3 font-bold">{s.fullName}</td>
                  <td className="px-4 py-3" dir="ltr">{s.phone}</td>
                  <td className="px-4 py-3">{s.gradeName}</td>
                  <td className="px-4 py-3">
                    <LevelBadge levelKey={s.level?.key} name={s.level?.name} nameEn={s.level?.nameEn} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <ExamScores scores={s.examScores ?? []} emptyLabel={t('admin.noExamScores')} />
                  </td>
                  <td className="px-4 py-3">{statusBadge(s)}</td>
                  <td className="px-4 py-3">
                    {s.role === 'admin' ? (
                      <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">{t('profile.admin')}</span>
                    ) : (
                      <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-300">{t('profile.student')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {s.role === 'student' && (
                        <>
                          <button
                            onClick={() => toggleSubscription(s)}
                            disabled={isBusy(s.id, 'sub')}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60 ${s.subscription ? 'border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors'}`}
                          >
                            {isBusy(s.id, 'sub') ? <Spinner /> : null}
                            {s.subscription ? t('admin.disableSub') : t('admin.enableSub')}
                          </button>
                          <button
                            onClick={() => toggleBlock(s)}
                            disabled={isBusy(s.id, 'block')}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60 ${s.blocked ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors' : 'bg-fire-500/20 text-fire-300 hover:bg-fire-500/30 transition-colors'}`}
                          >
                            {isBusy(s.id, 'block') ? <Spinner /> : null}
                            {s.blocked ? t('admin.unblock') : t('admin.block')}
                          </button>
                          <button
                            onClick={() => deleteStudent(s)}
                            disabled={isBusy(s.id, 'delete')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-fire-950/60 px-2.5 py-1 text-xs font-bold text-fire-300 hover:bg-fire-600/30 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy(s.id, 'delete') ? <Spinner /> : '🗑'}
                            {t('admin.deleteAccount')}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => toggleRole(s)}
                        disabled={isBusy(s.id, 'role')}
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy(s.id, 'role') ? <Spinner /> : null}
                        {s.role === 'admin' ? t('admin.makeStudent') : t('admin.makeAdmin')} ⇄
                      </button>
                      <button
                        onClick={() => openDetail(s.id)}
                        disabled={isBusy(s.id, 'detail')}
                        className="btn-ghost-fire inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy(s.id, 'detail') ? <Spinner /> : null}
                        {t('admin.details')}
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-400">{t('admin.pageInfo', { page, totalPages })}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-ghost-fire rounded-lg px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('admin.pagePrev')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn-ghost-fire rounded-lg px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('admin.pageNext')}
            </button>
          </div>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.user.fullName : ''}>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {statusBadge(detail.user)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Info label={t('profile.phone')} value={<span dir="ltr">{detail.user.phone}</span>} />
              <Info label={t('profile.grade')} value={detail.user.gradeName} />
              <Info label={t('profile.examAvg')} value={`${detail.stats.examAvg}%`} />
              <Info label={t('admin.points')} value={`${detail.stats.points}/100`} />
              <Info label={t('profile.completedLessons')} value={`${detail.stats.completedLessons}/${detail.stats.totalLessons}`} />
              <Info label={t('exam.bestScore')} value={detail.results.length ? `${Math.max(...detail.results.map((r) => r.best ?? 0))}%` : '—'} />
            </div>
            {detail.codeFiles.length > 0 && (
              <div>
                <div className="mb-2 font-bold text-gray-300">💻 {t('profile.savedCode')}</div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {detail.codeFiles.map((f) => (
                    <div key={f.id} className="rounded-lg bg-ink-900 px-3 py-2">
                      <div className="font-bold">{f.name}</div>
                      <div className="text-xs text-gray-500">{t(`code.${f.language}`)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detail.progress.length > 0 && (
              <div>
                <div className="mb-2 font-bold text-gray-300">🎬 {t('course.progress')}</div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {detail.progress.slice(0, 20).map((p) => (
                    <div key={p.lessonId} className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-1.5 text-xs">
                      <span>{t('course.lesson')} #{p.lessonId}</span>
                      <span className={p.completed ? 'text-emerald-400' : 'text-gray-400'}>{Math.round(p.secondsWatched)}s {p.completed ? '✓' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
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

/** درجات الطالب المئوية في كل امتحاناته، مرتبة الأحدث أولاً (بحسب at). */
function ExamScores({ scores, emptyLabel }: { scores: { examId: number; at: number; score: number }[]; emptyLabel: string }) {
  if (scores.length === 0) {
    return <div className="text-xs text-gray-500">{emptyLabel}</div>;
  }
  const sorted = [...scores].sort((a, b) => b.at - a.at);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sorted.map((s) => (
        <span
          key={s.examId}
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
            s.score >= 50 ? 'bg-fire-400/15 text-fire-300' : 'bg-red-500/15 text-red-400'
          }`}
        >
          {s.score}%
        </span>
      ))}
    </div>
  );
}
