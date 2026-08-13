import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { api } from '../api/client';
import ProgressBar from '../components/ProgressBar';

interface Course {
  id: number;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  lessonCount: number;
  completedLessons: number;
  progress: number;
  duration: number;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}`;
}

export default function Courses() {
  const { t, lang } = useLang();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ courses: Course[] }>('/api/courses')
      .then((d) => setCourses(d.courses))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-black">📚 {t('course.title')}</h1>
        <p className="mt-1 text-gray-400">{t('home.subtitle')}</p>
      </motion.div>

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : courses.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('course.noCourses')}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => {
            const done = c.progress === 100;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link to={`/courses/${c.id}`} className="card-fire card-fire-hover flex h-full flex-col rounded-3xl p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fire-600/30 to-ember-500/30 text-3xl">🚀</div>
                    {done && <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300">✓ {t('course.completed')}</span>}
                  </div>
                  <h2 className="text-lg font-extrabold">{lang === 'ar' ? c.title : c.titleEn}</h2>
                  <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-gray-400">{lang === 'ar' ? c.description : c.descriptionEn}</p>
                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {c.completedLessons}/{c.lessonCount} {t('course.lessons')} · {fmtDuration(c.duration)} {t('course.min')}
                    </span>
                    <span className="font-bold text-fire-400">{c.progress}%</span>
                  </div>
                  <ProgressBar value={c.progress} showLabel={false} className="mt-2" />
                  <div className="mt-4">
                    <span className="btn-fire inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">
                      {done ? t('course.review') : c.progress > 0 ? t('course.continue') : t('course.start')}
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
