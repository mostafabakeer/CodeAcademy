import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import LevelBadge from '../../components/LevelBadge';
import ProgressBar from '../../components/ProgressBar';

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

type Filter = 'all' | 'subscribed' | 'blocked';

const FILTERS: { key: Filter; tKey: string }[] = [
  { key: 'all', tKey: 'admin.filterAll' },
  { key: 'subscribed', tKey: 'admin.filterSubscribed' },
  { key: 'blocked', tKey: 'admin.filterBlocked' },
];

const GRADES = [
  { key: 'all', tKey: 'admin.gradeAll' },
  { key: 'bac1', tKey: 'auth.bac1' },
  { key: 'bac2', tKey: 'auth.bac2' },
];

export default function StudentsAdmin() {
  const { t } = useLang();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('all');

  const load = () => {
    api<{ users: Student[] }>('/api/admin/users')
      .then((d) => setStudents(d.users))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleRole = async (id: number, role: string) => {
    try {
      await api(`/api/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleBlock = async (id: number, blocked: boolean) => {
    try {
      await api(`/api/admin/users/${id}/block`, { method: 'PUT', body: JSON.stringify({ blocked }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleSubscription = async (id: number, subscription: boolean) => {
    try {
      await api(`/api/admin/users/${id}/subscription`, { method: 'PUT', body: JSON.stringify({ subscription }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteStudent = async (s: Student) => {
    if (!window.confirm(t('admin.deleteAccountConfirm'))) return;
    try {
      await api(`/api/admin/users/${s.id}`, { method: 'DELETE' });
      if (detail?.user?.id === s.id) setDetail(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const d = await api<Detail>(`/api/admin/users/${id}`);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = students.filter((s) => {
    if (filter === 'subscribed') {
      if (!(s.subscription && s.role === 'student')) return false;
    } else if (filter === 'blocked') {
      if (!s.blocked) return false;
    }
    if (grade !== 'all' && s.grade !== grade) return false;
    if (q) {
      const hay = `${s.fullName} ${s.phone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const statusBadge = (s: Student) => {
    if (s.blocked)
      return <span className="rounded-full bg-fire-500/20 px-2.5 py-0.5 text-xs font-bold text-fire-300">🚫 {t('admin.blocked')}</span>;
    if (s.subscription)
      return <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">✓ {t('admin.subscribed')}</span>;
    return <span className="rounded-full bg-ink-600/40 px-2.5 py-0.5 text-xs font-bold text-gray-400">— {t('admin.notSubscribed')}</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          👨‍🎓 {t('admin.studentsList')}{' '}
          <span className="text-base font-bold text-fire-400">({students.length})</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filter === f.key ? 'bg-fire-500/20 text-fire-300 ring-1 ring-fire-500/40' : 'bg-ink-800 text-gray-400 hover:text-white'
              }`}
            >
              {t(f.tKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.searchStudents')}
            className="input-fire w-full rounded-xl py-2.5 pe-10 ps-10 text-sm"
          />
        </div>
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="input-fire rounded-xl px-3.5 py-2.5 text-sm"
        >
          {GRADES.map((g) => (
            <option key={g.key} value={g.key}>
              {t(g.tKey)}
            </option>
          ))}
        </select>
        <span className="rounded-full bg-ink-800 px-3.5 py-1.5 text-xs font-bold text-fire-300">
          {t('admin.resultsCount', { count: filtered.length, total: students.length })}
        </span>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
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
                <th className="px-4 py-3 text-start">{t('admin.points')}</th>
                <th className="px-4 py-3 text-start">{t('admin.status')}</th>
                <th className="px-4 py-3 text-start">{t('admin.role')}</th>
                <th className="px-4 py-3 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="border-b border-ink-800 hover:bg-ink-850">
                  <td className="px-4 py-3 font-bold">{s.fullName}</td>
                  <td className="px-4 py-3" dir="ltr">{s.phone}</td>
                  <td className="px-4 py-3">{s.gradeName}</td>
                  <td className="px-4 py-3">
                    <LevelBadge levelKey={s.level?.key} name={s.level?.name} nameEn={s.level?.nameEn} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fire-400">{s.points}</span>
                      <div className="w-16"><ProgressBar value={s.points} showLabel={false} /></div>
                    </div>
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
                            onClick={() => toggleSubscription(s.id, !s.subscription)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${s.subscription ? 'border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
                          >
                            {s.subscription ? t('admin.disableSub') : t('admin.enableSub')}
                          </button>
                          <button
                            onClick={() => toggleBlock(s.id, !s.blocked)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${s.blocked ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-fire-500/20 text-fire-300 hover:bg-fire-500/30'}`}
                          >
                            {s.blocked ? t('admin.unblock') : t('admin.block')}
                          </button>
                          <button
                            onClick={() => deleteStudent(s)}
                            className="rounded-lg bg-fire-950/60 px-2.5 py-1 text-xs font-bold text-fire-300 hover:bg-fire-600/30"
                          >
                            🗑 {t('admin.deleteAccount')}
                          </button>
                        </>
                      )}
                      <button onClick={() => toggleRole(s.id, s.role === 'admin' ? 'student' : 'admin')} className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20">
                        {s.role === 'admin' ? t('admin.makeStudent') : t('admin.makeAdmin')} ⇄
                      </button>
                      <button onClick={() => openDetail(s.id)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold">
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

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-900 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
