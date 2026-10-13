import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import Seo from '../components/Seo';
import PublicCourseCard from '../components/PublicCourseCard';
import { loadPublicCourses, type PublicCourse } from '../lib/content';
import { LoadError } from '../components/PageStatus';
import { courseListSchema, graph, breadcrumbSchema } from '../lib/seo/schema';

export default function PublicCatalog() {
  const { t } = useLang();
  const [courses, setCourses] = useState<PublicCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (force = false) => {
    setError(null);
    if (!force) setCourses(null);
    loadPublicCourses(force)
      .then(setCourses)
      .catch(() => setError(t('public.loadError')));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jsonLd =
    courses && courses.length > 0
      ? graph([
          breadcrumbSchema([
            { name: t('nav.home'), path: '/' },
            { name: t('public.coursesTitle'), path: '/courses' },
          ]),
          courseListSchema(
            courses.map((c) => ({ id: c.id, name: c.title, description: c.description, image: c.image, lessonsCount: c.lessonCount }))
          ),
        ])
      : null;

  return (
    <div className="space-y-6">
      <Seo title={t('public.coursesTitle')} description={t('public.coursesSubtitle')} path="/courses" jsonLd={jsonLd} />

      <div>
        <h1 className="text-2xl font-black sm:text-3xl">📚 {t('public.coursesTitle')}</h1>
        <p className="mt-1 text-gray-400">{t('public.coursesSubtitle')}</p>
      </div>

      {error ? (
        <LoadError message={error} onRetry={() => load(true)} />
      ) : courses === null ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : courses.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('public.noCourses')}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => (
            <PublicCourseCard key={c.id} course={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
