import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useUser } from '../store/authStore';
import { buildCourseDetail, type CourseDetailData } from '../lib/content';
import { useBootstrapData } from '../lib/useBootstrapData';
import { StaleNotice, LoadError } from '../components/PageStatus';
import ProgressBar from '../components/ProgressBar';
import LessonListItem from '../components/LessonListItem';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}

export default function CourseDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const user = useUser();
  const { data: boot, error, retry } = useBootstrapData(user?.id);
  const courseId = id ? Number(id) : null;
  const detail = useMemo<CourseDetailData | null>(
    () => (boot && courseId ? buildCourseDetail(boot, courseId) : null),
    [boot, courseId]
  );

  if (!boot && !error) return <p className="text-gray-400">{t('common.loading')}</p>;
  if (error && !boot) return <LoadError message={error} onRetry={retry} />;
  if (!detail) return <p className="text-gray-400">{t('errors.generic')}</p>;

  const { course, lessons } = detail;
  const done = lessons.filter((l) => l.completed).length;

  return (
    <div className="space-y-6">
      {error && <StaleNotice message={error} onRetry={retry} />}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card-fire rounded-3xl p-6">
        <Link to="/courses" className="text-sm font-semibold text-gray-400 hover:text-fire-400">← {t('course.title')}</Link>
        <h1 className="mt-2 text-3xl font-black">{lang === 'ar' ? course.title : course.titleEn}</h1>
        <p className="mt-2 text-gray-400">{lang === 'ar' ? course.description : course.descriptionEn}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="min-w-40 flex-1">
            <div className="mb-1 flex justify-between text-xs text-gray-400">
              <span>{t('course.progress')}</span>
              <span>{done}/{lessons.length} {t('course.lessons')}</span>
            </div>
            <ProgressBar value={lessons.length ? Math.round((done / lessons.length) * 100) : 0} showLabel={false} />
          </div>
          {detail.examsCount > 0 && (
            <Link to="/exams" className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold">
              📝 {t('course.exam')} ({detail.examsCount})
            </Link>
          )}
          <Link to="/notes" className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold">
            📖 {t('course.notes')}
          </Link>
        </div>
      </motion.div>

      <div className="space-y-3">
        {lessons.map((l, i) => (
          <LessonListItem key={l.id} lesson={l} index={i} lang={lang} />
        ))}
        {lessons.length === 0 && <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>}
      </div>
    </div>
  );
}
