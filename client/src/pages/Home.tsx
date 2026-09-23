import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { loadBootstrap, buildCourseList, type CourseWithProgress } from '../lib/content';
import { getAllVideoProgressLocal } from '../lib/localStore';
import LevelBadge from '../components/LevelBadge';
import StatCard from '../components/StatCard';
import ProgressBar from '../components/ProgressBar';
import DoctorCode from '../components/DoctorCode';

export default function Home() {
  const { t, lang } = useLang();
  const { user, stats } = useAuth();
  const [courses, setCourses] = useState<CourseWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    loadBootstrap(userId)
      .then((b) => setCourses(buildCourseList(b, getAllVideoProgressLocal())))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const watchHours = stats ? Math.round(stats.watchRatio * (stats.totalLessons * 10)) / 10 : 0;
  const nextCourse = courses.filter((c) => c.progress > 0 && c.progress < 100).sort((a, b) => b.progress - a.progress)[0];
  const levelLabel = lang === 'ar' ? stats?.level.name : stats?.level.nameEn;

  return (
    <div className="space-y-8">
      {/* Hero مميز: الماسكوت + نافذة كود */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="pattern-dots relative overflow-hidden rounded-3xl border border-fire-500/25 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-fire-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-10 h-72 w-72 rounded-full bg-ember-500/20 blur-3xl" />

        <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:items-center lg:justify-between lg:text-start">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-wide text-ember-400">
              🔥 {stats?.totalLessons ? t('home.welcomeBack') : t('home.startJourney')},
            </p>
            <h1 className="mt-2 break-words text-2xl font-black sm:text-4xl md:text-5xl">
              {user?.fullName} <span className="text-fire-shine">👋</span>
            </h1>
            <p className="mt-3 text-gray-400">{t('home.subtitle')}</p>

            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <LevelBadge levelKey={stats?.level.key} name={stats?.level.name} nameEn={stats?.level.nameEn} size="lg" />
              <div className="flex items-center gap-4 rounded-2xl border border-fire-500/20 bg-ink-900/70 px-5 py-3">
                <div>
                  <div className="text-xs text-gray-400">{t('home.level')}</div>
                  <div className="text-xl font-black text-fire-gradient">{levelLabel}</div>
                </div>
                <div className="h-8 w-px bg-fire-500/25" />
                <div>
                  <div className="text-xs text-gray-400">{t('home.points')}</div>
                  <div className="text-xl font-black text-fire-gradient">{stats?.points ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative shrink-0">
            <br/>
            <DoctorCode size="lg" />
            <div className="pointer-events-none absolute inset-0 m-auto h-40 w-40 rounded-full bg-fire-500/10 blur-2xl" />
          </div>
        </div>

        {/* نافذة كود ترحيبية بطابع خاص */}
        <div className="relative mt-8 grid gap-4 lg:grid-cols-2">
          <div className="term-win">
            <div className="term-bar">
              <span className="dot dot-r" />
              <span className="dot dot-y" />
              <span className="dot dot-g" />
              <span className="term-title">drcode/doctor.k — دكتور كود</span>
            </div>
            <div className="term-body">
              <div className="term-line"><span className="term-var">class</span> <span className="term-fn">DoctorCode</span> <span className="term-var">extends</span> <span className="term-fn">Brain</span> {'{'}</div>
              <div className="term-line">  <span className="term-key">constructor</span>() {'{'}</div>
              <div className="term-line">    <span className="term-dim">// شغّلت دماغك 🔥</span></div>
              <div className="term-line">    <span className="term-var">this</span>.power <span className="term-key">=</span> <span className="term-str">'∞'</span>;</div>
              <div className="term-line">  {'}'}</div>
              <div className="term-line"><span className="term-str">'عايز تبرمج؟ خلّينا نبدأ ✨'</span><span className="term-caret" /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 self-center">
            <StatCard icon="📝" label={t('home.stats.examAvg')} value={`${stats?.examAvg ?? 0}%`} delay={0} />
            <StatCard icon="🎬" label={t('home.stats.watchTime')} value={`${watchHours} ${t('home.stats.watchUnit')}`} delay={0.05} />
            <StatCard icon="✅" label={t('home.stats.completedLessons')} value={`${stats?.completedLessons ?? 0}/${stats?.totalLessons ?? 0}`} delay={0.1} />
            <StatCard icon="💻" label={t('home.stats.examsTaken')} value={`${stats?.examsTaken ?? 0}/${stats?.totalExams ?? 0}`} delay={0.15} />
          </div>
        </div>
      </motion.section>

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
