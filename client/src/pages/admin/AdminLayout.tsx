import { NavLink, Outlet } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';

export default function AdminLayout() {
  const { t } = useLang();
  const links = [
    { to: '/admin', label: t('admin.dashboard'), icon: '📊', end: true },
    { to: '/admin/courses', label: t('admin.courses'), icon: '📚' },
    { to: '/admin/lessons', label: t('admin.lessons'), icon: '🎬' },
    { to: '/admin/exams', label: t('admin.exams'), icon: '📝' },
    { to: '/admin/notes', label: t('admin.notes'), icon: '📖' },
    { to: '/admin/students', label: t('admin.students'), icon: '👨‍🎓' },
    { to: '/admin/top-students', label: t('admin.topStudents'), icon: '🏆' },
    { to: '/admin/leaderboard', label: t('admin.examResults'), icon: '📈' },
    { to: '/admin/settings', label: t('admin.settings'), icon: '⚙️' },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <motion.aside initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="card-fire h-fit rounded-2xl p-3 lg:sticky lg:top-20">
        <div className="mb-3 flex items-center gap-2 px-3 pt-2">
          <span className="text-2xl">🛡️</span>
          <span className="font-black">{t('admin.title')}</span>
        </div>
        <nav className="space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-gradient-to-r from-fire-600/30 to-ember-500/20 text-fire-300' : 'text-gray-300 hover:bg-ink-800 hover:text-white'
                }`
              }
            >
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </motion.aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
