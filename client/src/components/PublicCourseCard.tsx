import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import type { PublicCourse } from '../lib/content';

export default function PublicCourseCard({ course, index = 0 }: { course: PublicCourse; index?: number }) {
  const { t, lang } = useLang();
  const title = lang === 'ar' ? course.title : course.titleEn || course.title;
  const description = lang === 'ar' ? course.description : course.descriptionEn || course.description;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Link to={`/courses/${course.id}`} className="card-fire card-fire-hover flex h-full flex-col overflow-hidden rounded-3xl">
        <div className="aspect-video w-full overflow-hidden bg-ink-900">
          {course.image ? (
            <img
              src={course.image}
              alt={title}
              loading="lazy"
              decoding="async"
              width={640}
              height={360}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl">🚀</div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-6">
          <h2 className="text-lg font-extrabold">{title}</h2>
          {description && <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-gray-400">{description}</p>}
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>{t('public.lessonsCount', { count: course.lessonCount })}</span>
            {course.gradeName && <span className="font-bold text-fire-400">{course.gradeName}</span>}
          </div>
          <div className="mt-4">
            <span className="btn-fire inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">{t('public.viewCourse')}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
