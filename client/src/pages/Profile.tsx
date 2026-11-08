import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useUser, useProgress, useSession } from '../store/authStore';
import { api } from '../api/client';
import {
  isPushSupported,
  isIOS,
  isStandalonePwa,
  getPushSubscription,
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
  type PushStatus,
} from '../lib/pushNotifications';
import LevelBadge from '../components/LevelBadge';
import StatCard from '../components/StatCard';
import ProgressBar from '../components/ProgressBar';

type PushState = 'loading' | 'unsupported' | 'enabled' | 'disabled' | 'denied';

export default function Profile() {
  const { t, lang } = useLang();
  const user = useUser();
  const { stats } = useProgress();
  const { logoutAll } = useSession();
  const [codeFiles, setCodeFiles] = useState<{ id: number; name: string; language: string; updatedAt: number }[]>([]);
  const [secBusy, setSecBusy] = useState(false);
  const [secError, setSecError] = useState('');
  const [pushState, setPushState] = useState<PushState>('loading');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const showIosHint = isIOS() && !isStandalonePwa();

  const refreshPushStatus = () => {
    void getPushStatus().then(setPushStatus);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      refreshPushStatus();
      if (!isPushSupported()) {
        if (active) setPushState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (active) setPushState('denied');
        return;
      }
      const sub = await getPushSubscription();
      if (active) setPushState(sub ? 'enabled' : 'disabled');
    })();
    return () => {
      active = false;
    };
  }, []);

  const togglePush = async () => {
    setPushMsg('');
    setPushBusy(true);
    try {
      if (pushState === 'enabled') {
        await unsubscribeFromPush();
        setPushState('disabled');
      } else {
        const sub = await subscribeToPush();
        setPushState(sub ? 'enabled' : 'disabled');
        if (!sub) setPushMsg(t('profile.pushMissingKey'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('denied')) setPushState('denied');
      setPushMsg(
        msg.includes('not configured') ? t('profile.pushMissingKey') : t('profile.pushError'),
      );
    } finally {
      setPushBusy(false);
      refreshPushStatus();
    }
  };

  const testPush = async () => {
    setPushMsg('');
    try {
      await sendTestPush();
    } catch {
      setPushMsg(t('profile.pushError'));
    }
  };

  useEffect(() => {
    api<{ files: { id: number; name: string; language: string; updatedAt: number }[] }>('/api/code')
      .then((d) => setCodeFiles(d.files))
      .catch(() => {});
  }, []);

  if (!user) return null;
  const watchMins = stats ? Math.round(stats.watchRatio * (stats.totalLessons * 10) * 60) / 60 : 0;
  const gradeName = user.grade === 'bac1' ? t('auth.bac1') : t('auth.bac2');

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card-fire rounded-3xl p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-fire-600 to-ember-500 text-4xl font-black shadow-lg shadow-fire-900/50">
            {user.fullName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black">{user.fullName}</h1>
              <LevelBadge levelKey={stats?.level.key} name={stats?.level.name} nameEn={stats?.level.nameEn} />
              <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${user.role === 'admin' ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}`}>
                {user.role === 'admin' ? t('profile.admin') : t('profile.student')}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-gray-500">{t('profile.phone')}</div>
                <div dir="ltr" className="font-bold">{user.phone}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('profile.grade')}</div>
                <div className="font-bold">{gradeName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('profile.memberSince')}</div>
                <div className="font-bold">{new Date(user.createdAt ?? Date.now()).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('profile.role')}</div>
                <div className="font-bold">{user.role === 'admin' ? t('profile.admin') : t('profile.student')}</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="📝" label={t('profile.examAvg')} value={`${stats?.examAvg ?? 0}%`} />
        <StatCard icon="🎬" label={t('profile.watchTime')} value={`${watchMins} ${t('course.min')}`} />
        <StatCard icon="✅" label={t('profile.completedLessons')} value={`${stats?.completedLessons ?? 0}/${stats?.totalLessons ?? 0}`} />
        <StatCard icon="💻" label={t('profile.codeFiles')} value={codeFiles.length} />
      </section>

      {stats && (
        <div className="card-fire rounded-2xl p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold">{t('profile.levelProgress')}</h2>
            <span className="text-sm text-gray-400">{t('level.pointsNeeded')}: {stats.points}/100</span>
          </div>
          <ProgressBar value={stats.points} />
          <p className="mt-3 text-sm text-gray-500">{t('profile.levelHint')}</p>
        </div>
      )}

      <section className="card-fire rounded-2xl p-6">
        <h2 className="mb-2 font-extrabold">🔔 {t('profile.pushTitle')}</h2>
        <p className="mb-4 text-sm text-gray-500">{t('profile.pushHint')}</p>

        {showIosHint && (
          <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
            {t('profile.pushIosInstall')}
          </p>
        )}

        {pushStatus && !pushStatus.vapidConfigured && (
          <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
            {t('profile.pushServerOff')}
          </p>
        )}

        {pushState === 'loading' && <p className="text-sm text-gray-400">{t('common.loading')}</p>}

        {pushState === 'unsupported' && (
          <p className="text-sm text-amber-300">{t('profile.pushUnsupported')}</p>
        )}

        {pushState === 'denied' && (
          <p className="text-sm text-amber-300">{t('profile.pushDenied')}</p>
        )}

        {(pushState === 'disabled' || pushState === 'enabled') && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pushBusy}
              onClick={togglePush}
              className="rounded-xl border border-fire-500/40 bg-fire-500/10 px-4 py-2 text-sm font-bold text-fire-200 transition hover:bg-fire-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pushBusy
                ? t('common.loading')
                : pushState === 'enabled'
                  ? t('profile.pushDisable')
                  : t('profile.pushEnable')}
            </button>
            {pushState === 'enabled' && (
              <button
                type="button"
                onClick={testPush}
                className="rounded-xl border border-ink-600 bg-ink-900 px-4 py-2 text-sm font-bold text-gray-300 transition hover:bg-ink-800"
              >
                {t('profile.pushTest')}
              </button>
            )}
          </div>
        )}

        {pushState === 'enabled' && (
          <p className="mt-2 text-xs font-bold text-emerald-400">{t('profile.pushEnabled')}</p>
        )}
        {pushStatus && pushStatus.subscriptions > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            {t('profile.pushDevices', { count: pushStatus.subscriptions })}
          </p>
        )}
        {pushMsg && <p className="mt-2 text-sm font-bold text-red-400">{pushMsg}</p>}
      </section>

      <section className="card-fire rounded-2xl p-6">
        <h2 className="mb-2 font-extrabold">🔒 {t('profile.security')}</h2>
        <p className="mb-4 text-sm text-gray-500">{t('profile.securityHint')}</p>
        {secError && <p className="mb-3 text-sm font-bold text-red-400">{secError}</p>}
        <button
          type="button"
          disabled={secBusy}
          onClick={async () => {
            setSecError('');
            if (!window.confirm(t('profile.logoutAllConfirm'))) return;
            setSecBusy(true);
            try {
              await logoutAll();
            } catch {
              setSecError(t('profile.logoutAllError'));
              setSecBusy(false);
            }
          }}
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {secBusy ? t('profile.logoutAllWorking') : t('profile.logoutAll')}
        </button>
      </section>

      <section className="card-fire rounded-2xl p-6">
        <h2 className="mb-4 font-extrabold">💻 {t('profile.savedCode')}</h2>
        {codeFiles.length === 0 ? (
          <p className="text-sm text-gray-500">{t('code.noFiles')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {codeFiles.map((f) => (
              <Link key={f.id} to="/codelab" className="card-fire-hover rounded-xl border border-ink-600 bg-ink-900 p-4">
                <div className="font-bold">{f.name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {t(`code.${f.language}`)} · {new Date(f.updatedAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
