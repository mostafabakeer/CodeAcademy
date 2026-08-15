import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { loadBootstrap, buildCourseDetail, type CourseDetailData } from '../lib/content';
import ProgressBar from '../components/ProgressBar';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}

export default function CourseDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [data, setData] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const courseId = id ? Number(id) : null;
  const userId = user?.id;

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (!courseId || !userId) {
      setLoading(false);
      return;
    }
    loadBootstrap(userId)
      .then((b) => {
        if (active) setData(buildCourseDetail(b, courseId));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId, userId]);

  if (loading) return <p className="text-gray-400">{t('common.loading')}</p>;
  if (!data) return <p className="text-gray-400">{t('errors.generic')}</p>;

  const { course, lessons } = data;
  const done = lessons.filter((l) => l.completed).length;

  return (
    <div className="space-y-6">
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
          {data.examsCount > 0 && (
            <Link to="/exams" className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold">
              📝 {t('course.exam')} ({data.examsCount})
            </Link>
          )}
          <Link to="/notes" className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold">
            📖 {t('course.notes')}
          </Link>
        </div>
      </motion.div>

      <div className="space-y-3">
        {lessons.map((l, i) => (
          <motion.div key={l.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={`/lessons/${l.id}`} className="card-fire card-fire-hover flex items-center gap-4 rounded-2xl p-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black ${
                  l.completed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gradient-to-br from-fire-600 to-ember-500 text-white'
                }`}
              >
                {l.completed ? '✓' : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold">{lang === 'ar' ? l.title : l.titleEn}</h3>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>🎬 {fmt(l.duration)} {t('lessonPage.durationSec')}</span>
                  {l.completed && <span className="text-emerald-400">{t('course.completed')}</span>}
                  {!l.completed && l.watchedSeconds > 0 && (
                    <span>{l.progressPct}% {t('lessonPage.watched')}</span>
                  )}
                </div>
              </div>
              {!l.completed && l.watchedSeconds > 0 && (
                <div className="hidden w-28 sm:block">
                  <ProgressBar value={l.progressPct} showLabel={false} />
                </div>
              )}
              <span className="btn-fire shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white">
                {l.completed ? t('course.review') : l.watchedSeconds > 0 ? t('course.continue') : t('course.start')}
              </span>
            </Link>
          </motion.div>
        ))}
        {lessons.length === 0 && <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>}
      </div>
    </div>
  );
}
