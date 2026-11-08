import { useEffect, useMemo, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Bell } from 'lucide-react';
import { useLang } from '../i18n';
import { useSession } from '../store/authStore';
import { useBootstrapData } from '../lib/useBootstrapData';
import { getLocal, setLocal } from '../lib/storage';

type ContentNotification = {
  id: string;
  type: 'lesson' | 'exam' | 'note';
  title: string;
  createdAt: number;
  href: string;
};

export default function Navbar() {
  const { t, lang, setLang } = useLang();
  const { user, logout, offline } = useSession();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seen, setSeen] = useState<{ userId: number; at: number } | null>(null);
  const navigate = useNavigate();
  const contentUserId =
    user && (user.role === 'admin' || (user.role === 'student' && user.subscription)) ? user.id : null;
  const { data: content } = useBootstrapData(contentUserId);
  const notifications = useMemo<ContentNotification[]>(() => {
    if (!content) return [];
    const recentAfter = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [
      ...content.lessons.map((item) => ({
        id: `lesson-${item.id}`,
        type: 'lesson' as const,
        title: lang === 'ar' ? item.title : item.titleEn || item.title,
        createdAt: Number(item.createdAt),
        href: `/lessons/${item.id}`,
      })),
      ...content.exams.map((item) => ({
        id: `exam-${item.id}`,
        type: 'exam' as const,
        title: lang === 'ar' ? item.title : item.titleEn || item.title,
        createdAt: Number(item.createdAt),
        href: `/exams/${item.id}`,
      })),
      ...content.notes.map((item) => ({
        id: `note-${item.id}`,
        type: 'note' as const,
        title: lang === 'ar' ? item.title : item.titleEn || item.title,
        createdAt: Number(item.createdAt),
        href: '/notes',
      })),
    ]
      .filter((item) =>
        Number.isFinite(item.createdAt) &&
        item.createdAt >= recentAfter &&
        item.createdAt <= Date.now()
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
  }, [content, lang]);

  useEffect(() => {
    if (!contentUserId) {
      setSeen(null);
      setNotificationsOpen(false);
      return;
    }
    const saved = Number(getLocal(`content-notifications-seen:${contentUserId}`));
    setSeen({
      userId: contentUserId,
      at: Number.isFinite(saved) && saved > 0 ? saved : user?.createdAt ?? Date.now(),
    });
  }, [contentUserId, user?.createdAt]);

  const unreadNotifications = seen?.userId === contentUserId
    ? notifications.filter((item) => item.createdAt > seen.at).length
    : 0;

  const openNotifications = () => {
    if (contentUserId && content) {
      const at = Date.now();
      setLocal(`content-notifications-seen:${contentUserId}`, String(at));
      setSeen({ userId: contentUserId, at });
    }
    setNotificationsOpen((value) => !value);
  };

  const links = [
    { to: '/', label: t('nav.home') },
    { to: user ? '/top-students/me' : '/top-students', label: t('nav.topStudents') },
  ];
  if (user) {
    links.push(
      { to: '/exams', label: t('nav.exams') },
      { to: '/notes', label: t('nav.notes') },
      { to: '/codelab', label: t('nav.codeLab') },
    );
  }
  if (user?.role === 'admin') links.push({ to: '/admin', label: t('nav.admin') });
  if (user) links.push({ to: '/profile', label: t('nav.profile') });

  const handleLogout = async () => {
    // ننتظر مسح كوكي الجلسة من الخادم قبل الانتقال، مع ضمان الانتقال في كل الأحوال.
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-fire-900/30 bg-ink-950/85 backdrop-blur-xl print:hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {offline && user && (
        <div className="border-b border-fire-900/30 bg-fire-950/50 px-4 py-1.5 text-center text-xs font-semibold text-fire-200">
          ⚡ {t('app.reconnectBanner')}
        </div>
      )}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="group flex min-w-0 items-center gap-2">
          <img
            src="/logo.webp"
            alt="DR Code"
            width={56}
            height={56}
            className="h-14 w-14 rounded-bl-full rounded-b-full object-contain shadow-xl shadow-fire-900/40 transition-transform group-hover:scale-110"
          />
          <span className="text-xl font-black tracking-tight">
            DR <span className="text-fire-gradient">Code</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? 'text-fire-400' : 'text-gray-300 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-fire-500 to-ember-500"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="btn-ghost-fire rounded-lg px-3 py-2 text-sm font-bold"
            title={t('nav.language') ?? ''}
          >
            {lang === 'ar' ? 'EN' : 'عربي'}
          </button>

          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="max-w-[140px] truncate text-sm font-semibold text-gray-300">{user.fullName}</span>
              <button
                onClick={handleLogout}
                className="btn-ghost-fire rounded-lg px-3 py-2 text-sm font-semibold"
              >
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/register" className="btn-ghost-fire rounded-lg px-4 py-2 text-sm font-semibold">
                {t('nav.register')}
              </Link>
              <Link to="/login" className="btn-fire rounded-lg px-4 py-2 text-sm font-bold text-white">
                {t('nav.login')}
              </Link>
            </div>
          )}

          {contentUserId && (
            <button
              type="button"
              onClick={openNotifications}
              className="btn-ghost-fire relative flex h-10 w-10 items-center justify-center rounded-lg"
              aria-label={t('nav.notifications')}
              aria-expanded={notificationsOpen}
              aria-controls="content-notifications"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadNotifications > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-fire-500 px-1 text-center text-[10px] font-bold leading-5 text-white">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setOpen(!open)}
            className="btn-ghost-fire rounded-lg p-2 lg:hidden"
            aria-label="menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              {open ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {notificationsOpen && contentUserId && (
        <div
          id="content-notifications"
          className="absolute end-3 top-full z-50 max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-fire-900/40 bg-ink-900 p-3 shadow-2xl shadow-black/50"
          role="region"
          aria-label={t('nav.notifications')}
        >
          <h2 className="mb-2 px-2 text-sm font-bold">{t('nav.notifications')}</h2>
          {!content ? (
            <p className="rounded-xl bg-ink-950 px-3 py-4 text-center text-sm text-gray-400">
              {t('common.loading')}
            </p>
          ) : notifications.length === 0 ? (
            <p className="rounded-xl bg-ink-950 px-3 py-4 text-center text-sm text-gray-400">
              {t('nav.noNotifications')}
            </p>
          ) : (
            <ul className="space-y-1">
              {notifications.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    onClick={() => {
                      setNotificationsOpen(false);
                      setOpen(false);
                    }}
                    className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fire-400"
                  >
                    <span className="block text-xs font-semibold text-fire-300">
                      {t(`nav.new${item.type[0].toUpperCase()}${item.type.slice(1)}`)}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-gray-100">{item.title}</span>
                    <time className="mt-1 block text-[11px] text-gray-500" dateTime={new Date(item.createdAt).toISOString()}>
                      {new Date(item.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en')}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            aria-label={t('nav.home') + ' — mobile'}
            className="overflow-hidden border-t border-fire-900/20 bg-ink-900/95 lg:hidden"
          >
            <div className="space-y-1 px-4 py-3">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-fire-500/15 text-fire-400' : 'text-gray-300'}`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
              <div className="flex gap-2 pt-2">
                {user ? (
                  <button onClick={handleLogout} className="btn-ghost-fire flex-1 rounded-lg px-4 py-2 text-sm font-semibold">
                    {t('nav.logout')}
                  </button>
                ) : (
                  <>
                    <Link to="/register" onClick={() => setOpen(false)} className="btn-ghost-fire flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold">
                      {t('nav.register')}
                    </Link>
                    <Link to="/login" onClick={() => setOpen(false)} className="btn-fire flex-1 rounded-lg px-4 py-2 text-center text-sm font-bold text-white">
                      {t('nav.login')}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
