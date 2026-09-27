import { FC } from 'react';
import { useLang } from '../i18n';
import { Spinner } from './Spinner';

interface ResetPanelProps {
  resetRequests: Array<{
    id: number;
    userId: number;
    status: 'pending' | 'approved' | 'completed' | 'rejected';
    createdAt: number;
    updatedAt: number;
    fullName: string;
    phone: string;
  }>;
  resetDiag: {
    total: number;
    byStatus: Record<string, number>;
    lastRequestAt: number | null;
    today: string;
    todayUnmatched: number;
  } | null;
  isBusy: (id: number, action: string) => boolean;
  onLoadResetRequests: () => void;
  onApproveReset: (r: { id: number; phone: string }) => void;
  onRejectReset: (r: { id: number; phone: string }) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  RESET_STATUS_KEYS: Record<string, string>;
  ago: (ms: number) => string;
}

const ResetPanel: FC<ResetPanelProps> = ({
  resetRequests,
  resetDiag,
  isBusy,
  onLoadResetRequests,
  onApproveReset,
  onRejectReset,
  t,
  RESET_STATUS_KEYS,
  ago,
}) => {
  return (
    <div className="card-fire overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <h2 className="text-base font-black">🔑 {t('admin.resetListTitle')}</h2>
        <button
          onClick={onLoadResetRequests}
          disabled={false}
          className="btn-ghost-fire inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-60"
        >
          🔄 {t('admin.resetRefresh')}
        </button>
      </div>
      {resetDiag && (
        <div className="border-b border-ink-800 bg-ink-900/60 px-4 py-2 text-xs text-gray-400">
          {resetDiag.total > 0 && resetDiag.lastRequestAt ? (
            <span>🕓 {t('admin.resetDiagLast', { time: ago(resetDiag.lastRequestAt) })}</span>
          ) : (
            <span>🕓 {t('admin.resetDiagNone')}</span>
          )}
          {resetDiag.todayUnmatched > 0 && (
            <span className="mx-2 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-300">
              ⚠ {t('admin.resetDiagUnmatched', { n: resetDiag.todayUnmatched })}
            </span>
          )}
          <span className="mx-1 opacity-70">· {t('admin.resetDiagLive')}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        {resetRequests.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{t('admin.resetPasswordEmpty')}</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink-600 text-start text-gray-400">
                <th className="px-4 py-2.5 text-start">{t('admin.resetStudent')}</th>
                <th className="px-4 py-2.5 text-start">{t('admin.resetPhone')}</th>
                <th className="px-4 py-2.5 text-start">{t('admin.resetStatus')}</th>
                <th className="px-4 py-2.5 text-start">{t('admin.resetRequestDate')}</th>
                <th className="px-4 py-2.5 text-end">{t('admin.resetActions')}</th>
              </tr>
            </thead>
            <tbody>
              {resetRequests.map((r) => (
                <tr key={r.id} className="border-b border-ink-800">
                  <td className="px-4 py-2.5 font-bold">{r.fullName}</td>
                  <td className="px-4 py-2.5" dir="ltr">{r.phone}</td>
                  <td className="px-4 py-2.5">
                    {r.status === 'pending' ? (
                      <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">{t('admin.resetRequestPending')}</span>
                    ) : r.status === 'approved' ? (
                      <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-300">{t('admin.resetRequestApproved')}</span>
                    ) : r.status === 'completed' ? (
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">{t('admin.resetRequestCompleted')}</span>
                    ) : (
                      <span className="rounded-full bg-fire-500/20 px-2.5 py-0.5 text-xs font-bold text-fire-300">{t('admin.resetRequestRejected')}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {(r.status === 'pending' || r.status === 'rejected') && (
                        <button
                          onClick={() => {}}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                        >
                          ✓ {t('admin.resetApprove')}
                        </button>
                      )}
                      {r.status === 'pending' && (
                        <button
                          onClick={() => {}}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-fire-950/60 px-2.5 py-1 text-xs font-bold text-fire-300 hover:bg-fire-600/30"
                        >
                          ✕ {t('admin.resetReject')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ResetPanel;