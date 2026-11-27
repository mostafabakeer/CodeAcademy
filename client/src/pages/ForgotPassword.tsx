import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { waLink } from '../config';
import { api } from '../api/client';
import Sparkles from '../components/Sparkles';

type Status = 'none' | 'pending' | 'approved' | 'rejected';

export default function ForgotPassword() {
  const { t } = useLang();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState<Status>('none');
  const [error, setError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!phone.trim()) return setError(t('auth.forgotNotFound'));
    setLoading(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { phone } });
      setRequested(true);
      setStatus('pending');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (silent = false) => {
    if (!silent) setError('');
    if (!silent) setLoading(true);
    try {
      const d = await api<{ status: Status }>(
        `/api/auth/forgot-password/status?phone=${encodeURIComponent(phone)}`
      );
      setStatus(d.status);
      if (d.status === 'none') setError(t('auth.forgotNoRequest'));
    } catch (err) {
      if (!silent) setError((err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    // Validate new password: at least 6 characters
    if (!newPassword || newPassword.length < 6)
      return setError(t('auth.forgotPasswordShort'));
    // Validate confirmation
    if (newPassword !== confirmPassword)
      return setError(t('auth.forgotPasswordMismatch'));

    setLoading(true);
    try {
      const res = await api<
        { ok: boolean }
      >('/api/auth/forgot-password/complete', {
        method: 'POST',
        body: { phone, password: newPassword },
      });
      if (res?.ok) {
        setDone(true);
      } else {
        setError(t('auth.forgotGenericError'));
      }
    } catch (err) {
      const apiErr = err as Error;
      if (apiErr.message.includes('not active') || apiErr.message.includes('غير مفعل')) {
        setError(t('auth.forgotNotActive'));
      } else if (apiErr.message.includes('pending') || apiErr.message.includes('بانتظار')) {
        setError(t('auth.forgotStepPendingMsg'));
      } else {
        setError(apiErr.message || t('auth.forgotGenericError'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-poll status while pending — updates UI when admin approves/rejects.
  // Backoff تدريجي (5s → 15s → 60s) + توقف عند إخفاء التاب: كان يستعلم كل
  // 5 ثوانٍ بلا نهاية حتى لو التاب متروك مفتوحاً طوال الليل.
  useEffect(() => {
    if (status !== 'pending' || !phone.trim() || done) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 5000;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'hidden') await checkStatus(true);
      delay = Math.min(delay * 2, 60_000);
      if (!cancelled) timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, delay);

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      clearTimeout(timer);
      delay = 5000;
      timer = setTimeout(tick, 1000);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkStatus تعتمد على phone وt
  }, [status, phone, done]);

  // Reset form state when leaving the approved/form state
  useEffect(() => {
    if (status !== 'approved' && status !== 'pending') {
      setNewPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [status]);

  const renderApprovedForm = (
    <form onSubmit={savePassword} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-300">
          {t('auth.forgotNewPassword')}
        </label>
        <input
          type="password"
          autoComplete="new-password"
          className="input-fire w-full rounded-xl px-4 py-3"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-300">
          {t('auth.forgotConfirmPassword')}
        </label>
        <input
          type="password"
          autoComplete="new-password"
          className="input-fire w-full rounded-xl px-4 py-3"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="btn-fire w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60"
      >
        {loading ? t('common.loading') : t('auth.forgotSavePassword')}
      </button>
    </form>
  );

  const renderPending = (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl bg-ink-800/60 px-4 py-3 text-emerald-300">
        {t('auth.forgotStepPending')}
      </div>
      <p className="text-gray-300">{t('auth.forgotStepPendingMsg')}</p>
      <p className="text-gray-400">{t('auth.forgotStepContact')}</p>
      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
        {t('auth.forgotPhoneCheck')}
      </p>
      <a
        href={waLink(t('auth.forgotWaMessage'))}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-fire flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white"
      >
        💬 {t('auth.contactReadmin')}
      </a>
      <button
        onClick={() => void checkStatus()}
        disabled={loading}
        className="btn-ghost-fire w-full rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60"
      >
        {loading ? t('common.loading') : t('auth.forgotCheckStatus')}
      </button>
    </div>
  );

  const renderBody = () => {
    if (done) {
      return (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-emerald-500/15 px-4 py-3 text-emerald-300">
            {t('auth.forgotSuccessMsg')}
          </div>
          <Link to="/login" className="btn-fire block w-full rounded-xl px-4 py-3 text-center font-bold text-white">
            {t('auth.backToLogin')}
          </Link>
        </div>
      );
    }
    if (status === 'approved') {
      return (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-emerald-500/15 px-4 py-3 text-emerald-300">
            {t('auth.forgotApproved')}
          </div>
          {renderApprovedForm}
        </div>
      );
    }
    if (status === 'rejected') {
      return (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-fire-500/15 px-4 py-3 text-fire-300">
            {t('auth.forgotRejected')}
          </div>
          <Link to="/login" className="btn-ghost-fire block w-full rounded-xl px-4 py-3 text-center text-sm font-bold">
            {t('auth.backToLogin')}
          </Link>
        </div>
      );
    }
    if (requested || status === 'pending') {
      return renderPending;
    }
    // الحالة الأولية: إدخال الرقم
    return (
      <form onSubmit={submitRequest} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-300">
            {t('auth.forgotPhoneLabel')}
          </label>
          <input
            type="text"
            dir="ltr"
            className="input-fire w-full rounded-xl px-4 py-3 text-left"
            placeholder={t('auth.forgotPhonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-fire w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60"
        >
          {loading ? t('common.loading') : t('auth.forgotSubmitRequest')}
        </button>
        <div className="text-center">
          <Link to="/login" className="text-sm font-bold text-fire-400 hover:text-fire-300">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </form>
    );
  };

  return (
    <div className="relative mx-auto flex min-h-[80vh] max-w-lg flex-col items-center justify-center py-10">
      <Sparkles behind />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-fire relative w-full overflow-hidden rounded-3xl"
      >
        <div className="relative z-10 p-8">
          <div className="mb-6 text-center">
            <img src="/logo.webp" alt="DR Code" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain drop-shadow-lg" />
            <h1 className="text-2xl font-black">{t('auth.forgotPasswordTitle')}</h1>
            <p className="mt-1 text-sm text-gray-400">{t('auth.forgotStepRequest')}</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
              {error}
            </div>
          )}

          {renderBody()}
        </div>
      </motion.div>
    </div>
  );
}