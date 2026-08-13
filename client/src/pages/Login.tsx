import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-fire w-full rounded-3xl p-8"
      >
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="DR Code" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain drop-shadow-lg" />
          <h1 className="text-2xl font-black">{t('auth.loginTitle')}</h1>
          <p className="mt-1 text-sm text-gray-400">{t('auth.loginWithPhone')}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.phone')}</label>
            <input
              type="text"
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
              className="input-fire w-full rounded-xl px-4 py-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-fire w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60">
            {loading ? t('common.loading') : t('auth.loginBtn')}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-400">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-bold text-fire-400 hover:text-fire-300">
            {t('nav.register')}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
