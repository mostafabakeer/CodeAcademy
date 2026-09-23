import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import DoctorCode from '../../components/DoctorCode';

interface Stats {
  students: number;
  admins: number;
  subscribed: number;
  courses: number;
  lessons: number;
  exams: number;
  notes: number;
  codeFiles: number;
}

export default function Dashboard() {
  const { t } = useLang();
  const [stats, setStats] = useState<Stats | null>(null);

  const load = () => api<{ stats: Stats }>('/api/admin/stats').then((d) => setStats(d.stats)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const subRatio = stats && stats.students > 0 ? Math.round((stats.subscribed / stats.students) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* الترويسة */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pattern-dots relative overflow-hidden rounded-3xl border border-fire-500/20 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-16 -end-16 h-56 w-56 rounded-full bg-fire-600/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ember-400">🛡️ {t('admin.obWelcome')}</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">⚡ {t('admin.dashboard')}</h1>
            <p className="mt-1 text-gray-400">{t('admin.obEverythingNow')} — {t('admin.obOverview')}</p>
          </div>
          <div className="hidden sm:block">
            <DoctorCode size="sm" />
          </div>
        </div>
      </motion.div>

      {/* شريط الأرقام الرئيسية */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: '👨‍🎓', label: t('admin.obStudentCount'), value: stats?.students ?? 0, color: 'from-fire-600 to-ember-500', delay: 0 },
          { icon: '⭐', label: t('admin.obSubCount'), value: stats?.subscribed ?? 0, color: 'from-ember-500 to-yellow-500', delay: 0.05 },
          { icon: '✅', label: t('admin.obActiveSub'), value: `${subRatio}%`, color: 'from-emerald-500 to-teal-500', delay: 0.1 },
          { icon: '🛡️', label: t('admin.obAdmins'), value: stats?.admins ?? 0, color: 'from-violet-500 to-fuchsia-500', delay: 0.15 },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: s.delay }} className="grid-brand grid-brand-hover p-5">
            <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${s.color}`}>
              <span className="text-lg">{s.icon}</span>
            </div>
            <div className="text-3xl font-black text-white">{s.value}</div>
            <div className="mt-1 text-sm text-gray-400">{s.label}</div>
          </motion.div>
        ))}
      </section>

      {/* قسم المحتوى */}
      <section>
        <div className="section-label mb-3">
          <span className="h-px flex-1 bg-gradient-to-r from-fire-500/60 to-transparent" />
          📚 {t('admin.obContent')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/admin/courses', icon: '📚', label: t('admin.courses'), count: stats?.courses ?? 0 },
            { to: '/admin/lessons', icon: '🎬', label: t('admin.lessons'), count: stats?.lessons ?? 0 },
            { to: '/admin/exams', icon: '📝', label: t('admin.exams'), count: stats?.exams ?? 0 },
            { to: '/admin/notes', icon: '📖', label: t('admin.notes'), count: stats?.notes ?? 0 },
          ].map((a, i) => (
            <motion.div key={a.to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05 }}>
              <Link to={a.to} className="grid-brand grid-brand-hover flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <span className="text-sm font-bold text-gray-200">{a.label}</span>
                </div>
                <span className="rounded-full bg-fire-500/15 px-3 py-1 text-sm font-black text-fire-300">{a.count}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* قسم الطلاب والنظام */}
      <section>
        <div className="section-label mb-3">
          <span className="h-px flex-1 bg-gradient-to-r from-fire-500/60 to-transparent" />
          👨‍🎓 {t('admin.obUsers')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/admin/students', icon: '👨‍🎓', label: t('admin.students') },
            { to: '/admin/top-students', icon: '🏆', label: t('admin.obTopStudents') },
            { to: '/admin/leaderboard', icon: '📈', label: t('admin.obExamResults') },
            { to: '/admin/settings', icon: '⚙️', label: t('admin.obQuickSettings') },
          ].map((a, i) => (
            <motion.div key={a.to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
              <Link to={a.to} className="grid-brand grid-brand-hover flex items-center gap-3 p-5">
                <span className="text-2xl">{a.icon}</span>
                <span className="text-sm font-bold text-gray-200">{a.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* إجراءات سريعة */}
      <section>
        <div className="section-label mb-3">
          <span className="h-px flex-1 bg-gradient-to-r from-fire-500/60 to-transparent" />
          ⚡ {t('home.quickActions')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/admin/courses?new=1', icon: '➕', label: t('admin.obQuickAddCourse') },
            { to: '/admin/lessons', icon: '🎬', label: t('admin.obQuickAddLesson') },
            { to: '/admin/exams', icon: '📝', label: t('admin.obQuickAddExam') },
            { to: '/admin/students', icon: '🔍', label: t('admin.obQuickAudit') },
          ].map((a, i) => (
            <motion.div key={a.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.05 }}>
              <Link to={a.to} className="grid-brand grid-brand-hover flex items-center justify-between p-4">
                <span className="text-sm font-bold text-gray-200">{a.label}</span>
                <span className="text-fire-400">{t('admin.obOpen')} ←</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}