import { useState, useEffect } from 'react';
import { useLang } from '../i18n';
import {
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribedToPush,
  sendTestPush,
  isPushSupported,
  getPushStatus,
} from '../lib/pushNotifications';

interface PushStatus {
  vapidConfigured: boolean;
  subscriptions: number;
}

export default function NotificationSettings() {
  const { t } = useLang();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    setLoading(true);
    try {
      const isSub = await isSubscribedToPush();
      setSubscribed(isSub);
      const s = await getPushStatus();
      setStatus(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe() {
    setError('');
    try {
      await subscribeToPush();
      setSubscribed(true);
      await checkStatus();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleUnsubscribe() {
    setError('');
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      await checkStatus();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleTest() {
    setError('');
    try {
      await sendTestPush();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!isPushSupported()) {
    return (
      <div className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-gray-400">
        <p className="text-sm">{t('profile.pushUnsupported')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-fire-500/20 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-5">
        <h3 className="mb-3 text-lg font-bold text-fire-300">🔔 {t('profile.pushTitle')}</h3>

        {loading ? (
          <p className="text-gray-400">{t('common.loading')}</p>
        ) : (
          <div className="space-y-3">
            {subscribed ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/20 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-emerald-200">✓ {t('profile.pushEnabled')}</p>
                  <button
                    onClick={handleUnsubscribe}
                    className="rounded-lg border border-fire-500/40 px-3 py-1.5 text-sm font-bold text-fire-300 hover:bg-fire-500/10"
                  >
                    {t('profile.pushDisable')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleSubscribe}
                className="btn-fire w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white"
              >
                {t('profile.pushEnable')}
              </button>
            )}

            <button
              onClick={handleTest}
              className="w-full rounded-xl border border-fire-500/30 px-4 py-2.5 text-sm font-bold text-fire-300 hover:bg-fire-500/10"
            >
              {t('profile.pushTest')}
            </button>

            {status && (
              <div className="mt-2 text-xs text-gray-500">
                <p>{t('profile.pushDevices', { count: status.subscriptions })}</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 p-3 text-sm text-fire-300">
            {error}
          </div>
        )}

        <p className="mt-2 text-xs text-gray-500">{t('profile.pushHint')}</p>
      </div>

      <div className="card-fire rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-bold text-gray-200">⚡ {t('profile.security')}</h3>
        <p className="mb-3 text-xs text-gray-400">{t('profile.securityHint')}</p>
        <button
          onClick={() => window.confirm(t('profile.logoutAllConfirm')) && true}
          className="rounded-lg border border-fire-500/40 px-4 py-2 text-sm font-bold text-fire-300 hover:bg-fire-500/10"
        >
          {t('profile.logoutAll')}
        </button>
      </div>
    </div>
  );
}