import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import LevelBadge from '../components/LevelBadge';
import StatCard from '../components/StatCard';
import ProgressBar from '../components/ProgressBar';

export default function Profile() {
  const { t, lang } = useLang();
  const { user, stats } = useAuth();
  const [codeFiles, setCodeFiles] = useState<{ id: number; name: string; language: string; updatedAt: number }[]>([]);

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
