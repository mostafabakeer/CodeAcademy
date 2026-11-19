import type { FC, ReactNode } from 'react';
import type { BadgeUser } from '../types/admin';
import { formatClock, formatDurationLabel } from '../lib/format';

interface ModalContentProps {
  detail: {
    user: {
      fullName: string;
      phone: string;
      gradeName: string;
      blocked: boolean;
      subscription: boolean;
    };
    stats: {
      examAvg: number;
      points: number;
      progressPoints?: number;
      watchedSeconds?: number;
      completedLessons: number;
      totalLessons: number;
    };
    results: Array<{ best?: number }>;
    // يطابق ما يرسله GET /admin/users/:id/detail (id مستخدم كمفتاح React key)
    codeFiles: Array<{ id: number; name: string; language: string; updatedAt?: number }>;
    progress: Array<{
      lessonId: number;
      secondsWatched: number;
      completed: boolean;
      lessonTitle?: string;
      lessonTitleEn?: string;
      lessonDuration?: number;
    }>;
  };
  t: (key: string, params?: Record<string, string | number>) => string;
  lang: 'ar' | 'en';
  statusBadge: (user: BadgeUser) => ReactNode;
  Info: FC<{ label: string; value: React.ReactNode }>;
}

const ModalContent: FC<ModalContentProps> = ({
  detail,
  t,
  lang,
  statusBadge,
  Info,
}) => {
  const { stats } = detail;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {statusBadge(detail.user)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Info label={t('profile.phone')} value={detail.user.phone} />
        <Info label={t('profile.grade')} value={detail.user.gradeName} />
        <Info label={t('profile.examAvg')} value={`${stats.examAvg}%`} />
        <Info label={t('admin.points')} value={`${stats.points}/100`} />
        <Info label={t('profile.progressPoints')} value={stats.progressPoints ?? 0} />
        <Info label={t('profile.watchTime')} value={formatDurationLabel(stats.watchedSeconds ?? 0, t)} />
        <Info label={t('profile.completedLessons')} value={`${stats.completedLessons}/${stats.totalLessons}`} />
        <Info label={t('exam.bestScore')} value={detail.results.length ? `${Math.max(...detail.results.map((r) => r.best ?? 0))}%` : '—'} />
      </div>
      {detail.codeFiles.length > 0 && (
        <div>
          <div className="mb-2 font-bold text-gray-300">💻 {t('profile.savedCode')}</div>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {detail.codeFiles.map((f) => (
              <div key={f.id} className="rounded-lg bg-ink-900 px-3 py-2">
                <div className="font-bold">{f.name}</div>
                <div className="text-xs text-gray-500">{t(`code.${f.language}`)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {detail.progress.length > 0 && (
        <div>
          <div className="mb-2 font-bold text-gray-300">🎬 {t('course.progress')}</div>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {detail.progress.slice(0, 20).map((p) => {
              const duration = p.lessonDuration ?? 0;
              const pct = duration > 0 ? Math.min(100, Math.round((p.secondsWatched / duration) * 100)) : 0;
              const title = lang === 'ar'
                ? (p.lessonTitle || `${t('course.lesson')} #${p.lessonId}`)
                : (p.lessonTitleEn || p.lessonTitle || `${t('course.lesson')} #${p.lessonId}`);
              return (
                <div key={p.lessonId} className="flex items-center justify-between gap-3 rounded-lg bg-ink-900 px-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate">{title}</span>
                  <span className={`shrink-0 ${p.completed ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {formatClock(p.secondsWatched)}
                    {duration > 0 ? ` / ${formatClock(duration)} · ${pct}%` : ''}
                    {p.completed ? ' ✓' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};

export default ModalContent;
