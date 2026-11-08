import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';

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

export default function AdminLayout() {
  const { t } = useLang();
  const { pathname } = useLocation();

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

  const allLinks = groups.flatMap((g) => g.links);

  // القسم الحالي — يظهر على الموبايل فوق شريط التنقل المختصر.
  const currentLink =
    [...allLinks]
      .sort((a, b) => b.to.length - a.to.length)
      .find((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to))) ?? allLinks[0];

  const pillClass = (isActive: boolean) =>
    `flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
      isActive
        ? 'bg-gradient-to-r from-fire-600/30 to-ember-500/20 text-fire-300'
        : 'text-gray-300 hover:bg-ink-800 hover:text-white'
    }`;

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      {/* ===== موبايل: شريط تنقل أفقي لاصق (بدل قائمة طويلة تدفع المحتوى لأسفل) ===== */}
      <div className="sticky top-16 z-20 lg:hidden">
        <div className="card-fire rounded-2xl bg-ink-950/95 p-2 backdrop-blur-lg">
          <div className="flex items-center gap-2 px-2 pb-2">
            <span className="text-lg">🛡️</span>
            <span className="truncate text-sm font-black">{t('admin.title')}</span>
            <span className="ms-auto truncate text-[11px] font-bold text-fire-300">{currentLink?.label}</span>
          </div>
          <nav
            aria-label={t('admin.title')}
            className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {allLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => pillClass(isActive)}
              >
                <span aria-hidden="true">{l.icon}</span>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* ===== كمبيوتر: قائمة جانبية ===== */}
      <motion.aside
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        className="card-fire hidden h-fit rounded-2xl p-3 lg:sticky lg:top-20 lg:block"
      >
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
                  <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => pillClass(isActive)}>
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
