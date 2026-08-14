import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import Sparkles from '../components/Sparkles';

export default function Register() {
  const { t } = useLang();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState('bac1');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || fullName.trim().length < 3) return setError(t('errors.required'));
    if (!/^[0-9+\s-]{8,15}$/.test(phone)) return setError(t('errors.invalidPhone'));
    if (password.length < 6) return setError(t('errors.passwordShort'));
    setLoading(true);
    try {
      await register(fullName.trim(), phone, grade, password);
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
            <img src="/logo.png" alt="DR Code" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain drop-shadow-lg" />
            <h1 className="text-2xl font-black">{t('auth.registerTitle')}</h1>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.fullName')}</label>
              <input
                type="text"
                className="input-fire w-full rounded-xl px-4 py-3"
                placeholder="مثال: أحمد محمد علي"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.phone')}</label>
              <input
                type="tel"
                dir="ltr"
                className="input-fire w-full rounded-xl px-4 py-3 text-left"
                placeholder={t('auth.phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.grade')}</label>
              <select className="input-fire w-full rounded-xl px-4 py-3" value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="bac1">{t('auth.bac1')}</option>
                <option value="bac2">{t('auth.bac2')}</option>
              </select>
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
              {loading ? t('common.loading') : t('auth.registerBtn')}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-400">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="font-bold text-fire-400 hover:text-fire-300">
              {t('nav.login')}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
