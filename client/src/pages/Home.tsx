import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import LevelBadge from '../components/LevelBadge';
import StatCard from '../components/StatCard';
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
}

export default function Home() {
  const { t, lang } = useLang();
  const { user, stats } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ courses: Course[] }>('/api/courses')
      .then((d) => setCourses(d.courses))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const watchHours = stats ? Math.round(stats.watchRatio * (stats.totalLessons * 10)) / 10 : 0;
  const nextCourse = courses.filter((c) => c.progress > 0 && c.progress < 100).sort((a, b) => b.progress - a.progress)[0];
  const levelLabel = lang === 'ar' ? stats?.level.name : stats?.level.nameEn;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-fire-500/20 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-8"
      >
        <div className="pointer-events-none absolute -top-20 -end-20 h-64 w-64 rounded-full bg-fire-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-10 h-64 w-64 rounded-full bg-ember-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-ember-400">
              🔥 {stats?.totalLessons ? t('home.welcomeBack') : t('home.startJourney')}،
            </p>
            <h1 className="mt-1 text-3xl font-black md:text-4xl">
              {user?.fullName} <span className="text-fire-shine">👋</span>
            </h1>
            <p className="mt-2 text-gray-400">{t('home.subtitle')}</p>
          </div>
          <div className="flex flex-col items-center gap-3 md:items-end">
            <LevelBadge levelKey={stats?.level.key} name={stats?.level.name} nameEn={stats?.level.nameEn} size="lg" />
            <div className="text-center md:text-end">
              <div className="text-sm text-gray-400">{t('home.level')}</div>
              <div className="text-3xl font-black text-fire-gradient">{levelLabel}</div>
              <div className="text-xs text-gray-500">
                {t('home.points')}: {stats?.points ?? 0}
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* إحصائيات */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="📝" label={t('home.stats.examAvg')} value={`${stats?.examAvg ?? 0}%`} delay={0} />
        <StatCard icon="🎬" label={t('home.stats.watchTime')} value={`${watchHours} س`} delay={0.05} />
        <StatCard icon="✅" label={t('home.stats.completedLessons')} value={`${stats?.completedLessons ?? 0}/${stats?.totalLessons ?? 0}`} delay={0.1} />
        <StatCard icon="💻" label={t('home.stats.examsTaken')} value={`${stats?.examsTaken ?? 0}/${stats?.totalExams ?? 0}`} delay={0.15} />
      </section>

      {/* أكمل التعلم */}
      {nextCourse && (
        <section className="card-fire rounded-2xl p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">▶ {t('home.continueLearning')}</h2>
            <Link to={`/courses/${nextCourse.id}`} className="btn-fire rounded-lg px-4 py-2 text-sm font-bold text-white">
              {t('course.continue')}
            </Link>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>{lang === 'ar' ? nextCourse.title : nextCourse.titleEn}</span>
            <span>{nextCourse.completedLessons}/{nextCourse.lessonCount} {t('course.lessons')}</span>
          </div>
          <ProgressBar value={nextCourse.progress} className="mt-2" />
        </section>
      )}

      {/* اختصارات */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { to: '/courses', icon: '📚', label: t('home.goToCourses') },
          { to: '/codelab', icon: '💻', label: t('home.goToCodeLab') },
          { to: '/exams', icon: '📝', label: t('home.goToExams') },
          { to: '/notes', icon: '📖', label: t('home.goToNotes') },
        ].map((a, i) => (
          <motion.div key={a.to} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.06 }}>
            <Link to={a.to} className="card-fire card-fire-hover flex items-center gap-3 rounded-2xl p-4">
              <span className="text-2xl">{a.icon}</span>
              <span className="text-sm font-bold text-gray-200">{a.label}</span>
            </Link>
          </motion.div>
        ))}
      </section>

      {/* الدورات */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{t('home.myCourses')}</h2>
          <Link to="/courses" className="text-sm font-bold text-fire-400 hover:text-fire-300">
            {t('common.back')} ←
          </Link>
        </div>
        {loading ? (
          <p className="text-gray-400">{t('common.loading')}</p>
        ) : courses.length === 0 ? (
          <p className="text-gray-400">{t('home.noCourses')}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={`/courses/${c.id}`} className="card-fire card-fire-hover block rounded-2xl p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-2xl">📚</span>
                    {c.progress === 100 ? <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">✓ {t('course.completed')}</span> : null}
                  </div>
                  <h3 className="font-extrabold">{lang === 'ar' ? c.title : c.titleEn}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-400">{lang === 'ar' ? c.description : c.descriptionEn}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                    <span>{c.completedLessons}/{c.lessonCount} {t('course.lessons')}</span>
                    <span>{c.progress}%</span>
                  </div>
                  <ProgressBar value={c.progress} showLabel={false} className="mt-1.5" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
