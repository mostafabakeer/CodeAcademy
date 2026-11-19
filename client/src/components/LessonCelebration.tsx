import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { watchedOf } from '../lib/format';
import Confetti from './Confetti';

interface LessonCelebrationProps {
  lessonTitle: string;
  watchedSeconds: number;
  durationSeconds: number;
  /** النقاط التي زادت فعلياً منذ فتح الدرس (قد تكون 0 لو الطالب كان قريباً من الإكمال). */
  pointsGained: number;
  /** إجمالي نقاط التقدّم بعد الإكمال. */
  totalPoints: number;
  onNext?: () => void;
  onClose: () => void;
}

/**
 * بطاقة إتمام الدرس: كونفيتي + المدة الحقيقية + نقاط التقدّم.
 * لا تحجب الفيديو بعد الإغلاق، ولا تظهر إلا مرة واحدة عند عبور 90%.
 */
export default function LessonCelebration({
  lessonTitle,
  watchedSeconds,
  durationSeconds,
  pointsGained,
  totalPoints,
  onNext,
  onClose,
}: LessonCelebrationProps) {
  const { t } = useLang();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <Confetti show count={64} />
      <div
        className="fixed inset-0 z-[59] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-celebration-title"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="card-fire w-full max-w-md rounded-3xl p-6 text-center shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            initial={{ scale: 0.4, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
            className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-4xl"
          >
            🎉
          </motion.div>

          <h2 id="lesson-celebration-title" className="text-2xl font-black">
            {t('celebration.lessonDone')}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-300">{lessonTitle}</p>

          <div className="mt-4 rounded-2xl border border-fire-500/20 bg-ink-900/70 px-4 py-3">
            <div className="text-sm font-bold text-gray-200">
              {watchedOf(watchedSeconds, durationSeconds, t)}
            </div>
            <div className="mt-2 text-lg font-black text-fire-gradient">
              {pointsGained > 0
                ? t('celebration.progressPointsAdded', { points: pointsGained })
                : t('celebration.progressRecorded')}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {t('celebration.totalPoints', { points: totalPoints })}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-gray-500">{t('celebration.pointsRule')}</p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {onNext && (
              <button onClick={onNext} className="btn-fire flex-1 rounded-xl px-5 py-2.5 text-sm font-bold text-white">
                {t('lessonPage.nextLesson')} ←
              </button>
            )}
            <button onClick={onClose} className="btn-ghost-fire flex-1 rounded-xl px-5 py-2.5 text-sm font-bold">
              {t('celebration.keepWatching')}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
