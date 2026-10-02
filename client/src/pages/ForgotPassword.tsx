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
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const [codeExpired, setCodeExpired] = useState(false);

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

  const checkStatus = async () => {
    setError('');
    setLoading(true);
    try {
      const d = await api<{ status: Status }>(
        `/api/auth/forgot-password/status?phone=${encodeURIComponent(phone)}`
      );
      setStatus(d.status);
      if (d.status === 'none') setError(t('auth.forgotNoRequest'));
      // If code expired, show message and allow resend
      if (d.status === 'rejected' || d.status === 'none') {
        setCodeExpired(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    // Validate code: exactly 6 digits
    const codeTrimmed = code.trim();
    if (
      !codeTrimmed ||
      codeTrimmed.length !== 6 ||
      !/^\d{6}$/.test(codeTrimmed)
    )
      return setError(t('auth.forgotCodeWrong'));
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
        body: { phone, password: newPassword, code: codeTrimmed },
      });
      if (res?.ok) {
        setDone(true);
      } else {
        setError(t('auth.forgotGenericError'));
      }
    } catch (err) {
      const apiErr = err as Error;
      // Distinguish error types for better UX
      if (apiErr.message.includes('expired')) {
        setCodeExpired(true);
        setError(t('auth.forgotCodeExpired'));
      } else if (apiErr.message.includes(' incorrect')) {
        setError(t('auth.forgotCodeWrong'));
      } else {
        setError(apiErr.message || t('auth.forgotGenericError'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-poll status while pending — updates UI when admin approves/rejects
  useEffect(() => {
    if (status !== 'pending' || !phone.trim() || done) return;
    const timer = setInterval(() => {
      checkStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, [status, phone, done]);

  // Reset form state when leaving the approved/form state
  useEffect(() => {
    if (status !== 'approved' && status !== 'pending') {
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setCodeExpired(false);
    }
  }, [status]);

  const renderApprovedForm = (
    <form onSubmit={savePassword} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-300">
          {t('auth.forgotCodeLabel')}
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={6}
          className="input-fire w-full rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.5em]"
          placeholder={t('auth.forgotCodePlaceholder')}
          value={code}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(val);
          }}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
          {t('auth.forgotCodeHint')}
        </p>
      </div>
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
        onClick={checkStatus}
        disabled={loading}
        className="btn-ghost-fire w-full rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60"
      >
        {loading ? t('common.loading') : t('auth.forgotCheckStatus')}
      </button>
    </div>
  );

  // Show resend code message when code is expired
  const renderCodeExpiredNotice = () => {
    if (!codeExpired) return null;
    return (
      <div className="mt-3 p-3 rounded-xl bg-fire-500/15 border border-fire-500/30 text-sm">
        {t('auth.forgotCodeExpiredNotice')}
        <br />
        <a
          onClick={(e) => {
            e.preventDefault();
            // Reset the code expired state - user can request new code
            // by going back to the phone entry state
            setCodeExpired(false);
          }}
          className="text-fire-300 hover:text-fire-300 underline"
        >
          {t('auth.resendCode')}
        </a>
      </div>
    );
  };

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
            <img src="/logo.png" alt="DR Code" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain drop-shadow-lg" />
            <h1 className="text-2xl font-black">{t('auth.forgotPasswordTitle')}</h1>
            <p className="mt-1 text-sm text-gray-400">{t('auth.forgotStepRequest')}</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
              {error}
            </div>
          )}

          {renderCodeExpiredNotice()}

          {renderBody()}
        </div>
      </motion.div>
    </div>
  );
}