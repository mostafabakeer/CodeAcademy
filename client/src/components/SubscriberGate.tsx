import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../i18n';
import { ADMIN_WHATSAPP_DISPLAY, waLink } from '../config';

function Paywall() {
  const { t } = useLang();
  return (
    <div className="mx-auto max-w-lg">
      <div className="card-fire rounded-3xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-fire-500/15 text-4xl">🔒</div>
        <h1 className="text-2xl font-black">{t('paywall.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-400">{t('paywall.msg')}</p>
        <div className="mt-6 rounded-2xl border border-ink-600 bg-ink-900 p-4 text-start text-sm text-gray-300">
          <div className="font-bold text-ember-300">{t('paywall.stepsTitle')}</div>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-gray-400">
            <li>{t('paywall.step1')}</li>
            <li>{t('paywall.step2')}</li>
            <li>{t('paywall.step3')}</li>
          </ol>
          <a
            href={waLink(t('paywall.waMessage'))}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-fire mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white"
          >
            💬 {t('paywall.contactWhatsApp')}
          </a>
          <p className="mt-2 text-center text-xs text-gray-500" dir="ltr">{ADMIN_WHATSAPP_DISPLAY}</p>
        </div>
      </div>
    </div>
  );
}

export default function SubscriberGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'admin') return <>{children}</>;
  if (!user?.subscription) return <Paywall />;
  return <>{children}</>;
}
