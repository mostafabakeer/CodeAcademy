import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import Seo from '../components/Seo';
import { LoadError } from '../components/PageStatus';
import { loadPublicCourse, type PublicCourseDetail } from '../lib/content';
import { breadcrumbSchema, courseSchema, graph } from '../lib/seo/schema';

export default function PublicCourseDetail() {
  const { t, lang } = useLang();
  const { id } = useParams<{ id: string }>();
  const courseId = Number(id);
  const [data, setData] = useState<PublicCourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = (force = false) => {
    setError(null);
    if (!force) setData(null);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      setNotFound(true);
      return;
    }
    loadPublicCourse(courseId)
      .then(setData)
      .catch(() => setError(t('public.loadError')));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const course = data?.course;
  const title = course ? (lang === 'ar' ? course.title : course.titleEn || course.title) : t('public.coursesTitle');
  const description = course ? (lang === 'ar' ? course.description : course.descriptionEn || course.description) : '';

  const jsonLd =
    course && data
      ? graph([
          breadcrumbSchema([
            { name: t('nav.home'), path: '/' },
            { name: t('public.coursesTitle'), path: '/courses' },
            { name: title, path: `/courses/${course.id}` },
          ]),
          courseSchema({ id: course.id, name: title, description, image: course.image, lessonsCount: course.lessonCount }),
        ])
      : null;

  if (notFound) {
    return (
      <div className="space-y-6">
        <Seo title={t('public.notFoundCourse')} path={`/courses/${id ?? ''}`} noindex />
        <div className="card-fire rounded-3xl p-8 text-center">
          <p className="text-lg font-bold">{t('public.notFoundCourse')}</p>
          <Link to="/courses" className="btn-fire mt-4 inline-block rounded-xl px-5 py-2.5 font-bold text-white">
            {t('public.backToCourses')}
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Seo title={t('public.coursesTitle')} path={`/courses/${id ?? ''}`} noindex />
        <LoadError message={error} onRetry={() => load(true)} />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="space-y-6">
        <p className="text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Seo
        title={title}
        description={description || t('public.coursesSubtitle')}
        path={`/courses/${course.id}`}
        image={course.image || undefined}
        type="article"
        jsonLd={jsonLd}
      />

      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/" className="hover:text-white">
          {t('nav.home')}
        </Link>
        <span>/</span>
        <Link to="/courses" className="hover:text-white">
          {t('public.coursesTitle')}
        </Link>
      </nav>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-8 lg:grid-cols-2">
        <div className="card-fire overflow-hidden rounded-3xl">
          {course.image ? (
            <img src={course.image} alt={title} width={1024} height={576} decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center text-6xl">🚀</div>
          )}
        </div>
        <div className="space-y-4">
          <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
          {description && <p className="leading-relaxed text-gray-400">{description}</p>}
          <div className="flex flex-wrap gap-3 text-sm text-gray-400">
            <span className="rounded-full border border-ink-600 bg-ink-900 px-3 py-1">
              {t('public.lessonsCount', { count: course.lessonCount })}
            </span>
            {data.examsCount > 0 && (
              <span className="rounded-full border border-ink-600 bg-ink-900 px-3 py-1">
                {t('public.examsCount', { count: data.examsCount })}
              </span>
            )}
            {course.gradeName && (
              <span className="rounded-full border border-fire-900/40 bg-ink-900 px-3 py-1 font-bold text-fire-300">{course.gradeName}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link to="/register" className="btn-fire rounded-xl px-6 py-3 font-bold text-white">
              {t('public.register')}
            </Link>
            <Link to="/login" className="btn-ghost-fire rounded-xl px-6 py-3 font-bold">
              {t('public.heroLogin')}
            </Link>
          </div>
        </div>
      </motion.section>

      <section className="space-y-4">
        <h2 className="text-xl font-black sm:text-2xl">{t('public.courseLessons')}</h2>
        {data.lessons.length === 0 ? (
          <p className="rounded-2xl border border-ink-600 bg-ink-900 p-6 text-center text-gray-400">{t('public.noCourses')}</p>
        ) : (
          <ol className="space-y-2">
            {data.lessons.map((lesson, i) => (
              <li
                key={lesson.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-ink-600 bg-ink-900 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fire-500/15 text-sm font-bold text-fire-300">
                    {i + 1}
                  </span>
                  <span className="truncate font-semibold">{lang === 'ar' ? lesson.title : lesson.titleEn || lesson.title}</span>
                </div>
                <span className="shrink-0 text-lg">🔒</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-center text-sm text-gray-500">{t('public.courseLocked')}</p>
      </section>

      <section className="card-fire rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-black sm:text-3xl">{t('public.courseCtaTitle')}</h2>
        <p className="mx-auto mt-2 max-w-xl text-gray-400">{t('public.courseCtaSub')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="btn-fire rounded-xl px-6 py-3 font-bold text-white">
            {t('public.register')}
          </Link>
          <Link to="/login" className="btn-ghost-fire rounded-xl px-6 py-3 font-bold">
            {t('public.heroLogin')}
          </Link>
        </div>
      </section>
    </div>
  );
}
