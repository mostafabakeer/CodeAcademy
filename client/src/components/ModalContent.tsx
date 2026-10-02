import type { FC, ReactNode } from 'react';
import type { BadgeUser } from '../types/admin';

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
      completedLessons: number;
      totalLessons: number;
    };
    results: Array<{ best?: number }>;
    // يطابق ما يرسله GET /admin/users/:id/detail (id مستخدم كمفتاح React key)
    codeFiles: Array<{ id: number; name: string; language: string; updatedAt?: number }>;
    progress: Array<{ lessonId: number; secondsWatched: number; completed: boolean }>;
  };
  t: (key: string, params?: Record<string, string | number>) => string;
  statusBadge: (user: BadgeUser) => ReactNode;
  Info: FC<{ label: string; value: React.ReactNode }>;
}

const ModalContent: FC<ModalContentProps> = ({
  detail,
  t,
  statusBadge,
  Info,
}) => {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {statusBadge(detail.user)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Info label={t('profile.phone')} value={detail.user.phone} />
        <Info label={t('profile.grade')} value={detail.user.gradeName} />
        <Info label={t('profile.examAvg')} value={`${detail.stats.examAvg}%`} />
        <Info label={t('admin.points')} value={`${detail.stats.points}/100`} />
        <Info label={t('profile.completedLessons')} value={`${detail.stats.completedLessons}/${detail.stats.totalLessons}`} />
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
            {detail.progress.slice(0, 20).map((p) => (
              <div key={p.lessonId} className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-1.5 text-xs">
                <span>{t('course.lesson')} #{p.lessonId}</span>
                <span className={p.completed ? 'text-emerald-400' : 'text-gray-400'}>{Math.round(p.secondsWatched)}s {p.completed ? '✓' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default ModalContent;