import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { loadBootstrap, buildLessonDetail, type LessonDetailData } from '../lib/content';
import { getVideoProgressLocal, setVideoProgressLocal, clearVideoProgressLocal } from '../lib/localStore';
import VideoPlayer from '../components/VideoPlayer';
import ProgressBar from '../components/ProgressBar';

export default function LessonPlayer() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<LessonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [completed, setCompleted] = useState(false);
  const lessonId = id ? Number(id) : null;
  const [localSeconds, setLocalSeconds] = useState(() => {
    const p = lessonId !== null ? getVideoProgressLocal(lessonId) : null;
    return p?.seconds ?? 0;
  });
  const [resumeAt, setResumeAt] = useState(() => {
    const p = lessonId !== null ? getVideoProgressLocal(lessonId) : null;
    return p?.seconds ?? 0;
  });
  const userId = user?.id;

  useEffect(() => {
    if (!lessonId || !userId) return;
    let active = true;
    setLoading(true);
    loadBootstrap(userId)
      .then((b) => {
        if (!active) return;
        const d = buildLessonDetail(b, lessonId);
        if (d) {
          setData(d);
          setDuration(d.lesson.duration || 0);
          setCompleted(!!d.lesson.completed);
          const local = getVideoProgressLocal(lessonId);
          if (local) {
            setLocalSeconds((s) => Math.max(s, local.seconds));
            if (!d.lesson.completed) setResumeAt(Math.max(local.seconds, resumeAt));
          }
        } else {
          setData(null);
        }
      })
      .catch(() => setData(null))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

  const reportProgress = (seconds: number) => {
    if (!lessonId || seconds <= 0) return;
    setLocalSeconds((s) => Math.max(s, seconds));
    setVideoProgressLocal(lessonId, seconds, duration);
    if (duration > 0 && seconds >= duration * 0.9) {
      setCompleted(true);
      clearVideoProgressLocal(lessonId);
    }
  };

  if (loading) return <p className="text-gray-400">{t('common.loading')}</p>;
  if (!data) return <p className="text-gray-400">{t('errors.generic')}</p>;

  const { lesson, lessons } = data;
  const idx = lessons.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx < lessons.length - 1 ? lessons[idx + 1] : null;
  const pct = lesson.duration > 0 ? Math.min(100, Math.round((Math.max(lesson.watchedSeconds || 0, localSeconds) / lesson.duration) * 100)) : 0;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link to={`/courses/${lesson.courseId}`} className="text-sm font-semibold text-gray-400 hover:text-fire-400">
          ← {t('course.title')}
        </Link>
        <h1 className="mt-2 break-words text-2xl font-black">{lang === 'ar' ? lesson.title : lesson.titleEn}</h1>
        <p className="mt-1 text-sm text-gray-400">{lesson.description}</p>
      </motion.div>

      <VideoPlayer
        videoType={lesson.videoType}
        videoUrl={lesson.videoUrl}
        initialTime={resumeAt}
        onProgress={reportProgress}
        onDuration={(d) => setDuration(d)}
      />

      <div className="card-fire rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-40 flex-1">
            <div className="mb-1 flex justify-between text-xs text-gray-400">
              <span>{t('course.progress')}</span>
              <span>{pct}%</span>
            </div>
            <ProgressBar value={completed ? 100 : pct} showLabel={false} />
          </div>
          <div className="flex items-center gap-3">
            {completed ? (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-sm font-bold text-emerald-300">🎉 {t('lessonPage.completed')}</span>
            ) : (
              <span className="text-xs text-gray-500">{t('lessonPage.completeHint')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {prev ? (
          <button onClick={() => navigate(`/lessons/${prev.id}`)} className="btn-ghost-fire rounded-xl px-5 py-2.5 text-sm font-bold">
            → {t('lessonPage.prevLesson')}: {lang === 'ar' ? prev.title : prev.titleEn}
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button onClick={() => navigate(`/lessons/${next.id}`)} className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">
            {t('lessonPage.nextLesson')}: {lang === 'ar' ? next.title : next.titleEn} ←
          </button>
        ) : (
          <Link to={`/courses/${lesson.courseId}`} className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">
            {t('home.goToCourses')} ←
          </Link>
        )}
      </div>
    </div>
  );
}
