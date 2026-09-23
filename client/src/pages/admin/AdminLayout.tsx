import { NavLink, Outlet } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';

export default function AdminLayout() {
  const { t } = useLang();
  interface AdminLink {
    to: string;
    label: string;
    icon: string;
    end?: boolean;
  }
  interface AdminGroup {
    label: string;
    links: AdminLink[];
  }
  const groups: AdminGroup[] = [
    {
      label: t('admin.obOverview'),
      links: [{ to: '/admin', label: t('admin.dashboard'), icon: '📊', end: true }],
    },
    {
      label: t('admin.obContent'),
      links: [
        { to: '/admin/courses', label: t('admin.courses'), icon: '📚' },
        { to: '/admin/lessons', label: t('admin.lessons'), icon: '🎬' },
        { to: '/admin/exams', label: t('admin.exams'), icon: '📝' },
        { to: '/admin/notes', label: t('admin.notes'), icon: '📖' },
      ],
    },
    {
      label: t('admin.obUsers'),
      links: [
        { to: '/admin/students', label: t('admin.students'), icon: '👨‍🎓' },
        { to: '/admin/top-students', label: t('admin.obTopStudents'), icon: '🏆' },
        { to: '/admin/leaderboard', label: t('admin.obExamResults'), icon: '📈' },
      ],
    },
    {
      label: t('admin.obSystem'),
      links: [{ to: '/admin/settings', label: t('admin.obQuickSettings'), icon: '⚙️' }],
    },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <motion.aside initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="card-fire h-fit rounded-2xl p-3 lg:sticky lg:top-20">
        <div className="mb-3 flex items-center gap-2 px-3 pt-2">
          <span className="text-2xl">🛡️</span>
          <span className="font-black">{t('admin.title')}</span>
        </div>
        <nav className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1 px-3 text-[10px] font-black uppercase tracking-wider text-gray-500">{g.label}</div>
              <div className="space-y-1">
                {g.links.map((l) => (
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
              </div>
            </div>
          ))}
        </nav>
      </motion.aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}