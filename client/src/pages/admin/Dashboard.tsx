import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import StatCard from '../../components/StatCard';

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

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">📊 {t('admin.dashboard')}</h1>
          <p className="text-sm text-gray-400">{t('admin.title')}</p>
        </div>
      </motion.div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="👨‍🎓" label={t('admin.studentsCount')} value={stats?.students ?? 0} />
        <StatCard icon="⭐" label={t('admin.subscribedCount')} value={stats?.subscribed ?? 0} delay={0.05} />
        <StatCard icon="📚" label={t('admin.coursesCount')} value={stats?.courses ?? 0} delay={0.1} />
        <StatCard icon="🎬" label={t('admin.lessonsCount')} value={stats?.lessons ?? 0} delay={0.15} />
        <StatCard icon="📝" label={t('admin.examsCount')} value={stats?.exams ?? 0} delay={0.2} />
        <StatCard icon="📖" label={t('admin.notesCount')} value={stats?.notes ?? 0} delay={0.25} />
        <StatCard icon="💻" label={t('admin.codeFiles')} value={stats?.codeFiles ?? 0} delay={0.3} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { to: '/admin/courses', icon: '📚', label: t('admin.courses') },
          { to: '/admin/lessons', icon: '🎬', label: t('admin.lessons') },
          { to: '/admin/exams', icon: '📝', label: t('admin.exams') },
          { to: '/admin/notes', icon: '📖', label: t('admin.notes') },
          { to: '/admin/students', icon: '👨‍🎓', label: t('admin.students') },
          { to: '/admin/settings', icon: '⚙️', label: t('admin.settings') },
        ].map((a, i) => (
          <motion.div key={a.to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
            <Link to={a.to} className="card-fire card-fire-hover flex items-center gap-4 rounded-2xl p-5">
              <span className="text-3xl">{a.icon}</span>
              <span className="font-bold">{a.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
