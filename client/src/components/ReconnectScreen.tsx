import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useLang } from '../i18n';
import { getLastAuthFail } from '../api/client';

export default function ReconnectScreen() {
  const reconnect = useAuthStore((s) => s.reconnect);
  const { t } = useLang();
  const [retrying, setRetrying] = useState(false);
  const autoTried = useRef(false);

  const lastFail = getLastAuthFail();
  const lastFailMsg =
    lastFail?.status === 0
      ? t('auth.diagNetwork')
      : (lastFail?.status ?? 0) >= 500
        ? t('auth.diagServer')
        : null;

  // محاولة تلقائية واحدة عند فتح صفحة محمية أثناء انقطاع مؤقت —
  // تتصلح تلقائيًا لو كان العطل عابرًا، دون أي تكرار/لوب.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    setRetrying(true);
    reconnect().finally(() => setRetrying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-fire-500/25 border-t-fire-500" />
        <div className="absolute inset-0 m-auto h-8 w-8 animate-flame rounded-full bg-gradient-to-br from-fire-500 to-ember-500" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-white">{t('app.reconnectTitle')}</h1>
        <p className="text-sm text-gray-400">{t('app.reconnectDesc')}</p>
        {lastFailMsg && <p className="pt-1 text-xs text-gray-500">{lastFailMsg}</p>}
      </div>
      <button
        type="button"
        onClick={async () => {
          setRetrying(true);
          await reconnect();
          setRetrying(false);
        }}
        disabled={retrying}
        className="rounded-xl bg-fire-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fire-500/20 transition hover:bg-fire-600 disabled:opacity-60"
      >
        {retrying ? '...' : t('app.reconnectBtn')}
      </button>
      {!retrying && (
        <Link
          to="/login"
          className="text-sm font-semibold text-fire-300 underline-offset-4 transition-colors hover:text-fire-200 hover:underline"
        >
          {t('app.reconnectLogin')}
        </Link>
      )}
    </div>
  );
}