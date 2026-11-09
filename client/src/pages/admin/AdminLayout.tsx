import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
    `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
      isActive
        ? 'bg-fire-500 text-white shadow-lg shadow-fire-500/20'
        : 'text-gray-400 hover:bg-ink-800 hover:text-white'
    }`;

  const mobilePillClass = (isActive: boolean) =>
    `flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
      isActive
        ? 'bg-fire-500 text-white shadow-md shadow-fire-500/10'
        : 'bg-ink-800 text-gray-400 hover:text-white'
    }`;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start max-w-full overflow-x-hidden">
      {/* ===== موبايل: ترويسة الأدمن مع زر القائمة ===== */}
      <div className="sticky top-16 z-30 px-0 pb-2 lg:hidden w-full">
        <div className="card-fire flex flex-col gap-3 rounded-2xl bg-ink-950/90 p-3 backdrop-blur-xl border-fire-500/20 shadow-2xl">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🛡️</span>
              <span className="font-black text-white">{t('admin.title')}</span>
              <span className="mx-2 h-4 w-px bg-ink-700" />
              <span className="text-xs font-bold text-fire-400">{currentLink?.label}</span>
            </div>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-white active:scale-95 transition-transform"
            >
              {isMenuOpen ? '✕' : '☰'}
            </button>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {allLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) => mobilePillClass(isActive)}
              >
                <span>{l.icon}</span>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* قائمة الموبايل المنسدلة (اختيارية كـ overlay) */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-x-4 top-full mt-2 z-40 max-h-[70vh] overflow-y-auto rounded-3xl border border-fire-500/20 bg-ink-900/95 p-4 shadow-2xl backdrop-blur-2xl"
            >
              <div className="space-y-6">
                {groups.map((g) => (
                  <div key={g.label}>
                    <div className="mb-3 px-2 text-[11px] font-black uppercase tracking-[0.1em] text-gray-500">{g.label}</div>
                    <div className="grid grid-cols-1 gap-2">
                      {g.links.map((l) => (
                        <NavLink
                          key={l.to}
                          to={l.to}
                          end={l.end}
                          onClick={() => setIsMenuOpen(false)}
                          className={({ isActive }) => pillClass(isActive)}
                        >
                          <span className="text-lg">{l.icon}</span>
                          {l.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== كمبيوتر: قائمة جانبية ثابته ===== */}
      <motion.aside
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        className="card-fire hidden w-[280px] shrink-0 rounded-3xl p-5 lg:sticky lg:top-24 lg:block border-fire-500/10 shadow-xl"
      >
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fire-500/10 text-2xl shadow-inner shadow-fire-500/20">
            🛡️
          </div>
          <div>
            <div className="text-sm font-bold text-gray-500">DR Code</div>
            <div className="text-lg font-black text-white">{t('admin.title')}</div>
          </div>
        </div>

        <nav className="space-y-7">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-3 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">{g.label}</div>
              <div className="space-y-1.5">
                {g.links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => pillClass(isActive)}>
                    <span className="text-xl">{l.icon}</span>
                    <span className="truncate">{l.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </motion.aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
