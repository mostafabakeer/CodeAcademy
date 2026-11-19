import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { formatDurationLabel, watchedOf } from '../lib/format';
import ProgressBar from './ProgressBar';

interface LessonListItemProps {
  lesson: {
    id: number;
    title: string;
    titleEn: string;
    duration: number;
    completed: boolean;
    watchedSeconds: number;
    progressPct: number;
  };
  index: number;
  lang: 'ar' | 'en';
}

const LessonListItem = memo(function LessonListItem({ lesson, index, lang }: LessonListItemProps) {
  const { t } = useLang();

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link to={`/lessons/${lesson.id}`} className="card-fire card-fire-hover flex items-center gap-4 rounded-2xl p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black ${
            lesson.completed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gradient-to-br from-fire-600 to-ember-500 text-white'
          }`}
        >
          {lesson.completed ? '✓' : index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{lang === 'ar' ? lesson.title : lesson.titleEn || lesson.title}</h3>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span>🎬 {formatDurationLabel(lesson.duration, t)}</span>
            {lesson.completed && <span className="text-emerald-400">{t('course.completed')}</span>}
            {!lesson.completed && lesson.watchedSeconds > 0 && (
              <span className="truncate">
                {watchedOf(lesson.watchedSeconds, lesson.duration, t)} · {lesson.progressPct}%
              </span>
            )}
          </div>
        </div>
        {!lesson.completed && lesson.watchedSeconds > 0 && (
          <div className="hidden w-28 sm:block">
            <ProgressBar value={lesson.progressPct} showLabel={false} />
          </div>
        )}
        <span className="btn-fire shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white">
          {lesson.completed ? t('course.review') : lesson.watchedSeconds > 0 ? t('course.continue') : t('course.start')}
        </span>
      </Link>
    </motion.div>
  );
});

export default LessonListItem;