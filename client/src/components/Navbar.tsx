import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { t, lang, setLang } = useLang();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const links = [
    { to: '/', label: t('nav.home') },
    { to: '/top-students', label: t('nav.topStudents') },
    { to: '/courses', label: t('nav.courses') },
    { to: '/exams', label: t('nav.exams') },
    { to: '/notes', label: t('nav.notes') },
    { to: '/codelab', label: t('nav.codeLab') },
  ];
  if (user?.role === 'admin') links.push({ to: '/admin', label: t('nav.admin') });
  if (user) links.push({ to: '/profile', label: t('nav.profile') });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-fire-900/30 bg-ink-950/85 backdrop-blur-xl print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="group flex min-w-0 items-center gap-2">
          <img
            src="/logo.png"
            alt="DR Code"
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

          <button
            onClick={() => setOpen(!open)}
            className="btn-ghost-fire rounded-lg p-2 lg:hidden"
            aria-label="menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              {open ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
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
