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

  const checkStatus = async () => {
    setError('');
    setLoading(true);
    try {
      const d = await api<{ status: Status }>(`/api/auth/forgot-password/status?phone=${encodeURIComponent(phone)}`);
      setStatus(d.status);
      if (d.status === 'none') setError(t('auth.forgotNoRequest'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.length < 6) return setError(t('auth.forgotPasswordShort'));
    if (newPassword !== confirmPassword) return setError(t('auth.forgotPasswordMismatch'));
    setLoading(true);
    try {
      await api('/api/auth/forgot-password/complete', { method: 'POST', body: { phone, password: newPassword } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // فحص تلقائي بينما الطلب pending — ما إن توافق الإدارة يظهر حقل كلمة السر الجديدة فورًا.
  useEffect(() => {
    if (status !== 'pending' || !phone.trim() || done) return;
    const timer = setInterval(() => {
      api<{ status: Status }>(`/api/auth/forgot-password/status?phone=${encodeURIComponent(phone)}`)
        .then((d) => {
          if (d.status === 'approved' || d.status === 'rejected') setStatus(d.status);
        })
        .catch(() => {
          /* تجاهل أخطاء الفحص المؤقت — سيُعاد بعد ثوانٍ */
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [status, phone, done]);

  const renderApprovedForm = (
    <form onSubmit={savePassword} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.forgotNewPassword')}</label>
        <input
          type="password"
          autoComplete="new-password"
          className="input-fire w-full rounded-xl px-4 py-3"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.forgotConfirmPassword')}</label>
        <input
          type="password"
          autoComplete="new-password"
          className="input-fire w-full rounded-xl px-4 py-3"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <button type="submit" disabled={loading} className="btn-fire w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60">
        {loading ? t('common.loading') : t('auth.forgotSavePassword')}
      </button>
    </form>
  );

  const renderPending = (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl bg-ink-800/60 px-4 py-3 text-emerald-300">{t('auth.forgotStepPending')}</div>
      <p className="text-gray-300">{t('auth.forgotStepPendingMsg')}</p>
      <p className="text-gray-400">{t('auth.forgotStepContact')}</p>
      <a
        href={waLink(t('auth.forgotWaMessage'))}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-fire flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white"
      >
        💬 {t('auth.contactReadmin')}
      </a>
      <button onClick={checkStatus} disabled={loading} className="btn-ghost-fire w-full rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60">
        {loading ? t('common.loading') : t('auth.forgotCheckStatus')}
      </button>
    </div>
  );

  const renderBody = () => {
    if (done) {
      return (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-emerald-500/15 px-4 py-3 text-emerald-300">{t('auth.forgotSuccessMsg')}</div>
          <Link to="/login" className="btn-fire block w-full rounded-xl px-4 py-3 text-center font-bold text-white">
            {t('auth.backToLogin')}
          </Link>
        </div>
      );
    }
    if (status === 'approved') {
      return (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-emerald-500/15 px-4 py-3 text-emerald-300">{t('auth.forgotApproved')}</div>
          {renderApprovedForm}
        </div>
      );
    }
    if (status === 'rejected') {
      return (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-fire-500/15 px-4 py-3 text-fire-300">{t('auth.forgotRejected')}</div>
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
          <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('auth.forgotPhoneLabel')}</label>
          <input
            type="text"
            dir="ltr"
            className="input-fire w-full rounded-xl px-4 py-3 text-left"
            placeholder={t('auth.forgotPhonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <button type="submit" disabled={loading} className="btn-fire w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60">
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
            <div className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
              {error}
            </div>
          )}

          {renderBody()}
        </div>
      </motion.div>
    </div>
  );
}
