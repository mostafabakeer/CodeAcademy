import { useEffect, useRef, useState } from 'react';
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

/** روابط الوصول السريع في شريط الموبايل — الباقي داخل قائمة ☰. */
const PRIMARY_PATHS = ['/admin', '/admin/students', '/admin/courses', '/admin/exams'];

export default function AdminLayout() {
  const { t } = useLang();
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
  const primaryLinks = PRIMARY_PATHS.map((to) => allLinks.find((l) => l.to === to)).filter(
    (l): l is AdminLink => Boolean(l),
  );

  // القسم الحالي — يظهر على الموبايل فوق شريط التنقل المختصر.
  const currentLink =
    [...allLinks]
      .sort((a, b) => b.to.length - a.to.length)
      .find((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to))) ?? allLinks[0];

  // إغلاق القائمة تلقائياً عند الانتقال لصفحة أخرى.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // إغلاق القائمة بالنقر خارجها أو بمفتاح Escape.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuPanelRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMenuOpen]);

  // منع تمرير الصفحة خلف القائمة المفتوحة.
  useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMenuOpen]);

  const pillClass = (isActive: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
      isActive
        ? 'bg-fire-500 text-white shadow-lg shadow-fire-500/20'
        : 'text-gray-400 hover:bg-ink-800 hover:text-white'
    }`;

  const mobilePillClass = (isActive: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-all sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
      isActive
        ? 'bg-fire-500 text-white shadow-md shadow-fire-500/10'
        : 'bg-ink-800 text-gray-400 hover:text-white'
    }`;

  return (
    /*
     * لا نستخدم overflow-x-hidden هنا: أي overflow على المحور الأفقي يجعل
     * overflow-y محسوباً auto، فيتحول العنصر لسياق تمرير بلا ارتفاع ثابت
     * فيتعطل sticky وتُقصّ القائمة المنسدلة. الحماية من الفائض على main فقط.
     */
    <div className="flex max-w-full flex-col gap-5 xl:flex-row xl:items-start">
      {/* ===== موبايل/تابلت: ترويسة الأدمن ===== */}
      <div className="sticky top-[var(--app-header-h)] z-30 w-full pb-1 xl:hidden">
        <div className="card-fire flex flex-col gap-2.5 rounded-2xl border-fire-500/20 bg-ink-950/90 p-2.5 shadow-2xl backdrop-blur-xl sm:p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-lg sm:text-xl" aria-hidden="true">
                🛡️
              </span>
              <span className="truncate font-black text-white">{t('admin.title')}</span>
              <span className="hidden h-4 w-px shrink-0 bg-ink-700 sm:block" aria-hidden="true" />
              <span className="hidden truncate text-xs font-bold text-fire-400 sm:block">
                {currentLink?.label}
              </span>
            </div>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-expanded={isMenuOpen}
              aria-controls="admin-mobile-menu"
              aria-label={isMenuOpen ? t('common.close') : t('admin.moreNav')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-white transition-transform active:scale-95"
            >
              {isMenuOpen ? '✕' : '☰'}
            </button>
          </div>

          <nav aria-label={t('admin.title')} className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {primaryLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) => `${mobilePillClass(isActive)} shrink-0`}
              >
                <span aria-hidden="true">{l.icon}</span>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* قائمة الموبايل الكاملة */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              <motion.div
                key="admin-menu-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMenuOpen(false)}
                aria-hidden="true"
                className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                key="admin-menu-panel"
                id="admin-mobile-menu"
                ref={menuPanelRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('admin.title')}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain rounded-3xl border border-fire-500/20 bg-ink-900/95 p-4 shadow-2xl backdrop-blur-2xl"
              >
                <div className="space-y-5">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.1em] text-gray-500">
                        {g.label}
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {g.links.map((l) => (
                          <NavLink
                            key={l.to}
                            to={l.to}
                            end={l.end}
                            onClick={() => setIsMenuOpen(false)}
                            className={({ isActive }) => pillClass(isActive)}
                          >
                            <span className="text-lg" aria-hidden="true">
                              {l.icon}
                            </span>
                            {l.label}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ===== كمبيوتر: قائمة جانبية ثابتة ===== */}
      <motion.aside
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        className="card-fire hidden w-[260px] shrink-0 rounded-3xl border-fire-500/10 p-4 shadow-xl xl:sticky xl:top-[calc(var(--app-header-h)_+_1rem)] xl:block"
      >
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fire-500/10 text-xl shadow-inner shadow-fire-500/20">
            🛡️
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-500">DR Code</div>
            <div className="truncate text-base font-black text-white">{t('admin.title')}</div>
          </div>
        </div>

        <nav className="space-y-6">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">
                {g.label}
              </div>
              <div className="space-y-1">
                {g.links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => pillClass(isActive)}>
                    <span className="text-lg" aria-hidden="true">
                      {l.icon}
                    </span>
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
