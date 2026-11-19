import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuthStore, useUser } from '../store/authStore';
import { buildLessonDetail, type BootstrapData } from '../lib/content';
import { useBootstrapData } from '../lib/useBootstrapData';
import { getAllVideoProgressLocal, getVideoProgressLocal, setVideoProgressLocal } from '../lib/localStore';
import { WatchTracker } from '../lib/watchTracker';
import { ensureProgressPulled, flushProgress, PROGRESS_PULLED_EVENT, queueProgress } from '../lib/progressSync';
import { watchTotals } from '../lib/stats';
import { formatDurationLabel, watchedOf } from '../lib/format';
import { playSuccessChime } from '../lib/sound';
import { touchStreak } from '../lib/streak';
import { StaleNotice, LoadError } from '../components/PageStatus';
import VideoPlayer from '../components/VideoPlayer';
import ProgressBar from '../components/ProgressBar';
import LessonCelebration from '../components/LessonCelebration';

/**
 * صفحة الدرس.
 *
 * الحالة كلها داخل `<LessonView key={lessonId}>`: عند الانتقال للدرس التالي
 * يتغيّر الـkey فيُعاد mount جديد بالكامل. هذا يمنع تسرّب `resumeAt`/الوقت/
 * حالة الإكمال من الدرس السابق (كان Math.max يخلط تقدّم درس بدرس).
 */
export default function LessonPlayer() {
  const { id } = useParams();
  const { t } = useLang();
  const user = useUser();
  const { data: boot, error, retry } = useBootstrapData(user?.id);
  const lessonId = id ? Number(id) : null;
  const [pullReady, setPullReady] = useState(false);

  // ننتظر محاولة جلب التقدّم الأولى (مرة واحدة لكل جلسة) قبل قراءة التخزين
  // المحلي، حتى لا يُفتح الدرس على 0 لمن بدّل جهازه. فشل الشبكة لا يحجب شيئاً.
  useEffect(() => {
    if (!user) {
      setPullReady(true);
      return;
    }
    let active = true;
    // سقف 4 ثوانٍ: لو الشبكة بطيئة لا نُعلّق صفحة الدرس — نكمل بالمحلي،
    // وحدث PROGRESS_PULLED_EVENT يحدّث الصفحة لو وصل الجلب بعد ذلك.
    const timer = window.setTimeout(() => {
      if (active) setPullReady(true);
    }, 4000);
    void ensureProgressPulled(user.id).finally(() => {
      window.clearTimeout(timer);
      if (active) setPullReady(true);
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [user?.id]);

  if (!pullReady) return <p className="text-gray-400">{t('common.loading')}</p>;
  if (!boot) {
    if (error) return <LoadError message={error} onRetry={retry} />;
    return <p className="text-gray-400">{t('common.loading')}</p>;
  }
  if (!lessonId || !Number.isFinite(lessonId)) return <p className="text-gray-400">{t('errors.generic')}</p>;

  return <LessonView key={lessonId} lessonId={lessonId} boot={boot} error={error} retry={retry} />;
}

function LessonView({
  lessonId,
  boot,
  error,
  retry,
}: {
  lessonId: number;
  boot: BootstrapData;
  error: string | null;
  retry: () => void;
}) {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const recomputeStats = useAuthStore((s) => s.recomputeStats);

  const detail = useMemo(() => buildLessonDetail(boot, lessonId), [boot, lessonId]);

  // القيم الأولية تُقرأ مرة واحدة عند mount (الـkey يضمن mount جديداً لكل درس).
  const initialLocal = useMemo(() => getVideoProgressLocal(lessonId), [lessonId]);
  const initialTotals = useMemo(() => watchTotals(boot.lessons, getAllVideoProgressLocal()), [boot.lessons]);

  // متتبّع مشاهدة واحد لكل درس: يحتسب الفترات الحقيقية فقط (السحب/التقفيل لا يُحتسب).
  const trackerRef = useRef<WatchTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new WatchTracker(lessonId, detail?.lesson.duration || initialLocal?.duration || 0);
  }
  const initialCovered = trackerRef.current.coveredSeconds();

  const [duration, setDuration] = useState(() => detail?.lesson.duration || initialLocal?.duration || 0);
  const [completed, setCompleted] = useState(() => !!detail?.lesson.completed);
  const [localSeconds, setLocalSeconds] = useState(initialCovered);
  // الاستئناف من آخر موضع تشغيل (وليس من التغطية) حتى لا تتأثر التجربة بمنع احتساب السحب.
  const [resumeAt, setResumeAt] = useState(() => initialLocal?.position ?? initialCovered);
  const [celebration, setCelebration] = useState<{
    watchedSeconds: number;
    durationSeconds: number;
    pointsGained: number;
    totalPoints: number;
  } | null>(null);
  const [pointToast, setPointToast] = useState<number | null>(null);

  const localSecondsRef = useRef(initialCovered);
  const lastPersistRef = useRef(0);
  const lastPointsRef = useRef(initialTotals.progressPoints);
  const sessionStartPointsRef = useRef(initialTotals.progressPoints);
  const celebratedRef = useRef(!!detail?.lesson.completed);
  const streakTouched = useRef(false);
  const preloadedNext = useRef(false);
  const pointToastTimer = useRef<number | null>(null);

  /**
   * يحفظ التغطية الحقيقية + فترات المشاهدة + موضع التشغيل، ويحدّث الإحصائيات.
   * `covered` = الثواني المُشاهدة فعلاً (من WatchTracker)، وليس موضع الفيديو.
   */
  const reportProgress = useCallback(
    (covered: number, durationOverride?: number) => {
      const tracker = trackerRef.current;
      const lessonDuration = durationOverride || duration || detail?.lesson.duration || 0;
      const known = Math.max(localSecondsRef.current, Math.max(0, covered));

      if (known !== localSecondsRef.current) {
        localSecondsRef.current = known;
        setLocalSeconds(known);
      }

      // الموضع يُحفظ دائماً (حتى لو التغطية صفر) كي يستأنف الطالب من مكانه.
      setVideoProgressLocal(
        lessonId,
        known,
        lessonDuration,
        tracker ? { segments: tracker.getSegments(), position: tracker.getPosition() } : undefined,
      );

      if (known <= 0) return;

      queueProgress(lessonId, known);

      if (!streakTouched.current && known >= 5) {
        streakTouched.current = true;
        touchStreak();
      }

      // نقاط التقدّم الحقيقية: كل 5 دقائق مشاهدة فعلية = نقطة.
      const totals = watchTotals(boot.lessons, getAllVideoProgressLocal());
      if (totals.progressPoints > lastPointsRef.current) {
        const gained = totals.progressPoints - lastPointsRef.current;
        lastPointsRef.current = totals.progressPoints;
        setPointToast(gained);
        if (pointToastTimer.current) window.clearTimeout(pointToastTimer.current);
        pointToastTimer.current = window.setTimeout(() => setPointToast(null), 3200);
      }

      // الإكمال: مرة واحدة فقط في هذه الجلسة، وفقط عند الانتقال من غير مكتمل لمكتمل.
      if (!celebratedRef.current && lessonDuration > 0 && known >= lessonDuration * 0.9) {
        celebratedRef.current = true;
        setCompleted(true);
        setCelebration({
          watchedSeconds: known,
          durationSeconds: lessonDuration,
          pointsGained: Math.max(0, totals.progressPoints - sessionStartPointsRef.current),
          totalPoints: totals.progressPoints,
        });
        // نرسل فوراً حتى يرى الأدمن التقدّم دون انتظار الدفعة الدورية.
        void flushProgress(true);
        recomputeStats();
        playSuccessChime();
      }

      // تحميل الدرس التالي في الخلفية عند 80%.
      if (lessonDuration > 0 && known >= lessonDuration * 0.8 && !preloadedNext.current) {
        preloadedNext.current = true;
      }
    },
    [boot.lessons, detail, duration, lessonId, recomputeStats],
  );

  /** نبضة المشغّل: نغذّي المتتبّع دائماً، ونحفظ/نزامن كل ~5 ثوانٍ وعند التوقف. */
  const handleTick = useCallback(
    (position: number, playing: boolean, rate: number) => {
      const tracker = trackerRef.current;
      if (!tracker) return;
      tracker.tick(position, playing, rate);

      const now = Date.now();
      if (!playing || now - lastPersistRef.current >= 5000) {
        lastPersistRef.current = now;
        reportProgress(Math.floor(tracker.coveredSeconds()));
      }
    },
    [reportProgress],
  );

  // حفظ فوري عند إخفاء الصفحة/إغلاق التبويب (يمنع فقدان آخر ثوانٍ).
  const persistRef = useRef<() => void>(() => {});
  persistRef.current = () => {
    const tracker = trackerRef.current;
    if (tracker) reportProgress(Math.floor(tracker.coveredSeconds()));
  };

  // عند مغادرة الدرس أو إخفاء الصفحة: احفظ آخر نبضة، أرسل ما تبقّى، وحدّث الإحصائيات.
  useEffect(() => {
    const persist = () => persistRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', persist);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', persist);
      persist();
      void flushProgress(true);
      recomputeStats();
      if (pointToastTimer.current) window.clearTimeout(pointToastTimer.current);
    };
  }, [recomputeStats]);

  // لو وصل تقدّم الخادم بعد فتح الصفحة (شبكة بطيئة): نعتمد الأكبر ما دام
  // الطالب لم يبدأ المشاهدة. درس مكتمل من جهاز آخر يُعلَّم مكتملاً بلا احتفال.
  useEffect(() => {
    const onPulled = () => {
      if (localSecondsRef.current > 0) return;
      const fresh = getVideoProgressLocal(lessonId);
      const seconds = fresh?.seconds ?? 0;
      if (seconds <= 0) return;
      localSecondsRef.current = seconds;
      setLocalSeconds(seconds);
      setResumeAt(fresh?.position ?? seconds);
      const d = duration || detail?.lesson.duration || fresh?.duration || 0;
      // المتتبّع أُنشئ قبل وصول التقدّم: نعيد بناءه من التخزين الجديد حتى
      // تعتمد تغطيته على فترات الخادم بدل البدء من صفر.
      trackerRef.current = new WatchTracker(lessonId, d);
      if (d > 0 && seconds >= d * 0.9) {
        celebratedRef.current = true;
        setCompleted(true);
      }
      recomputeStats();
    };
    window.addEventListener(PROGRESS_PULLED_EVENT, onPulled);
    return () => window.removeEventListener(PROGRESS_PULLED_EVENT, onPulled);
  }, [detail, duration, lessonId, recomputeStats]);

  if (!detail) return <p className="text-gray-400">{t('errors.generic')}</p>;

  const { lesson, lessons } = detail;
  const idx = lessons.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx < lessons.length - 1 ? lessons[idx + 1] : null;

  const pct = duration > 0 ? Math.min(100, Math.round((localSeconds / duration) * 100)) : 0;
  const goNext = next ? () => navigate(`/lessons/${next.id}`) : undefined;

  return (
    <div className="space-y-6">
      {error && <StaleNotice message={error} onRetry={retry} />}

      {pointToast !== null && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed left-1/2 top-20 z-[65] -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-lg"
        >
          +{pointToast} {t('celebration.progressPoint')}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link to={`/courses/${lesson.courseId}`} className="text-sm font-semibold text-gray-400 hover:text-fire-400">
          ← {t('course.title')}
        </Link>
        <h1 className="mt-2 break-words text-2xl font-black">{lang === 'ar' ? lesson.title : lesson.titleEn || lesson.title}</h1>
        <p className="mt-1 text-sm text-gray-400">{lesson.description}</p>
        <p className="mt-1 text-xs font-semibold text-gray-500">
          ⏱ {formatDurationLabel(lesson.duration, t)}
        </p>
      </motion.div>

      <VideoPlayer
        key={lesson.id}
        videoType={lesson.videoType}
        videoUrl={lesson.videoUrl}
        initialTime={resumeAt}
        onTick={handleTick}
        onDuration={(d) => {
          setDuration(d);
          const tracker = trackerRef.current;
          if (tracker) {
            tracker.setDuration(d);
            reportProgress(Math.floor(tracker.coveredSeconds()), d);
          }
        }}
        onEnded={() => void flushProgress(true)}
      />

      <div className="card-fire rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-40 flex-1">
            <div className="mb-1 flex justify-between text-xs text-gray-400">
              <span>{watchedOf(localSeconds, duration, t)}</span>
              <span>{pct}%</span>
            </div>
            <ProgressBar value={completed ? 100 : pct} showLabel={false} />
          </div>
          <div className="flex items-center gap-3">
            {completed ? (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-sm font-bold text-emerald-300">
                🎉 {t('lessonPage.completed')}
              </span>
            ) : (
              <span className="text-xs text-gray-500">{t('lessonPage.completeHint')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {prev ? (
          <button onClick={() => navigate(`/lessons/${prev.id}`)} className="btn-ghost-fire rounded-xl px-5 py-2.5 text-sm font-bold">
            → {t('lessonPage.prevLesson')}: {lang === 'ar' ? prev.title : prev.titleEn || prev.title}
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button onClick={goNext} className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">
            {t('lessonPage.nextLesson')}: {lang === 'ar' ? next.title : next.titleEn || next.title} ←
          </button>
        ) : (
          <Link to={`/courses/${lesson.courseId}`} className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">
            {t('home.goToCourses')} ←
          </Link>
        )}
      </div>

      {celebration && (
        <LessonCelebration
          lessonTitle={lang === 'ar' ? lesson.title : lesson.titleEn || lesson.title}
          watchedSeconds={celebration.watchedSeconds}
          durationSeconds={celebration.durationSeconds}
          pointsGained={celebration.pointsGained}
          totalPoints={celebration.totalPoints}
          onNext={goNext}
          onClose={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
