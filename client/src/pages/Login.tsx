import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuthStore } from '../store/authStore';
import { getLastAuthFail } from '../api/client';
import Sparkles from '../components/Sparkles';
import DoctorCode from '../components/DoctorCode';

export default function Login() {
  const { t } = useLang();
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lastFail = getLastAuthFail();
  const lastFailMsg =
    lastFail?.reason === 'expired'
      ? t('auth.diagExpired')
      : lastFail?.reason === 'invalid'
        ? t('auth.diagInvalid')
        : lastFail?.reason === 'blocked'
          ? t('auth.diagBlocked')
          : lastFail?.reason === 'missing-user'
            ? t('auth.diagMissingUser')
            : lastFail?.reason === 'server'
              ? t('auth.diagServer')
              : lastFail?.status === 0
                ? t('auth.diagNetwork')
                : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier || !password) return setError(t('errors.required'));
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-[80vh] max-w-lg flex-col items-center justify-center py-10">
      <Sparkles behind />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-fire relative w-full overflow-hidden rounded-3xl"
      >
        <img
          src="/login-hero.png"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/60 to-ink-950/20" />

        <Sparkles />

        <div className="relative z-10 p-8">
          <div className="mb-6 text-center">
            {/* <DoctorCode size="sm" className="mx-auto -top-2" /> */}
            <img src="/logo.png" alt="DR Code" className="mx-auto -mt-4 mb-2 h-16 w-16 rounded-2xl object-contain drop-shadow-lg" />
            <h1 className="text-2xl font-black">{t('auth.loginTitle')}</h1>
            <p className="mt-1 flex items-center justify-center gap-1 text-sm text-gray-400">
              {t('auth.loginWithPhone')}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.phone')}</label>
              <input
                type="text"
                name="username"
                autoComplete="username"
                dir="ltr"
                className="input-fire w-full rounded-xl px-4 py-3 text-left"
                placeholder={t('auth.phonePlaceholder')}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.password')}</label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                className="input-fire w-full rounded-xl px-4 py-3"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-fire w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60">
              {loading ? t('common.loading') : t('auth.loginBtn')}
            </button>
            <div className="text-center">
              <Link to="/forgot-password" className="text-sm font-bold text-fire-400 hover:text-fire-300">
                {t('auth.forgotPassword')}
              </Link>
            </div>
          </form>

          <p className="mt-5 text-center text-sm text-gray-400">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-bold text-fire-400 hover:text-fire-300">
              {t('nav.register')}
            </Link>
          </p>
        </div>
      </motion.div>

      {lastFailMsg && (
        <p className="mt-3 max-w-sm text-center text-xs leading-relaxed text-gray-500">⚠️ {lastFailMsg}</p>
      )}
    </div>
  );
}
