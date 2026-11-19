import type { VideoProgressLocal } from './localStore';

// ===== حساب إحصائيات الطالب — المرجع الوحيد للمعادلة =====
// هذه الدالة هي المصدر الوحيد لحساب الإحصائيات.
// الـ Backend (supabase/functions/_shared/db.ts) يطبق نفس المنطق في computeStudentStats.
// أي تغيير في المعادلة يجب تحديثه في المكانين لضمان تطابق النتائج.

export interface LevelTier {
  min: number;
  key: string;
  name: string;
  nameEn: string;
}

export interface StudentStats {
  examAvg: number;
  watchRatio: number;
  /** نقاط الإنجاز 0-100 (امتحانات 60% + مشاهدة 40%) — تحدد المستوى والترتيب. */
  points: number;
  level: LevelTier;
  completedLessons: number;
  totalLessons: number;
  examsTaken: number;
  totalExams: number;
  /** إجمالي ثواني المشاهدة الفعلية (مقصوصة على مدة كل درس). */
  watchedSeconds: number;
  /** نقاط التقدّم التراكمية: كل 5 دقائق مشاهدة = نقطة (بلا سقف). */
  progressPoints: number;
  /** نقاط الامتحانات: كل امتحان 10 نقاط كحد أقصى حسب أفضل درجة. */
  examPoints: number;
}

export interface LessonLike {
  id: number;
  duration: number;
}

/**
 * كل 5 دقائق مشاهدة فعلية = نقطة تقدّم.
 * نفس الثابت مطبّق في `supabase/functions/_shared/db.ts` — أي تغيير هنا يجب أن يقابله تغيير هناك.
 */
export const SECONDS_PER_PROGRESS_POINT = 300;

export function progressPointsFromSeconds(watchedSeconds: number): number {
  return Math.floor(Math.max(0, watchedSeconds) / SECONDS_PER_PROGRESS_POINT);
}

/** إجمالي المشاهدة ونقاط التقدّم من خريطة التقدّم المحلي (مقصوصة على مدة كل درس). */
export function watchTotals(
  lessons: LessonLike[],
  watch: Record<number, VideoProgressLocal>,
): { watchedSeconds: number; progressPoints: number } {
  let watchedSeconds = 0;
  for (const lesson of lessons) {
    const d = Number(lesson.duration) || 0;
    watchedSeconds += Math.min(watch[lesson.id]?.seconds ?? 0, d);
  }
  return { watchedSeconds, progressPoints: progressPointsFromSeconds(watchedSeconds) };
}

export function tierByPoints(points: number, tiers: LevelTier[]): LevelTier {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  return sorted.find((t) => points >= t.min) ?? sorted[sorted.length - 1] ?? { min: 0, key: 'beginner', name: 'مبتدئ', nameEn: 'Beginner' };
}

export interface ExamResultLike {
  examId: number;
  best: number;
}

/** كل امتحان = 10 نقاط كحد أقصى، تُوزّع على أفضل درجة (نسبة 0-100). */
export const EXAM_MAX_POINTS = 10;

export function examPointsForScore(best: number): number {
  return Math.max(0, Math.min(EXAM_MAX_POINTS, Math.round((Number(best) || 0) / 10)));
}

/** مجموع نقاط الامتحانات: مرة واحدة لكل امتحان، على أفضل درجة محفوظة. */
export function examPointsFromResults(results: ExamResultLike[]): number {
  const bestByExam = new Map<number, number>();
  for (const r of results) {
    const id = Number(r.examId);
    if (!Number.isFinite(id)) continue;
    bestByExam.set(id, Math.max(bestByExam.get(id) ?? 0, Number(r.best) || 0));
  }
  let total = 0;
  for (const best of bestByExam.values()) total += examPointsForScore(best);
  return total;
}

/** المجموع العام المعروض للطالب = نقاط التقدّم + نقاط الامتحانات. */
export function grandTotalPoints(stats: StudentStats): number {
  return Math.max(0, stats.progressPoints) + Math.max(0, stats.examPoints);
}

export interface ComputeStatsInput {
  lessons: LessonLike[];
  exams: { id: number }[];
  examResults: ExamResultLike[];
  watch: Record<number, VideoProgressLocal>;
  tiers: LevelTier[];
}

export function computeStats(input: ComputeStatsInput): StudentStats {
  const { lessons, exams, examResults, watch, tiers } = input;

  const scores = examResults.map((r) => Number(r.best ?? 0)).filter((s) => !Number.isNaN(s));
  const examAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  let totalDuration = 0;
  let totalWatched = 0;
  let completed = 0;
  for (const lesson of lessons) {
    const d = Number(lesson.duration) || 0;
    totalDuration += d;
    const w = Math.min(watch[lesson.id]?.seconds ?? 0, d);
    totalWatched += w;
    if (d > 0 && w >= d * 0.9) completed++;
  }

  const watchRatio = totalDuration > 0 ? totalWatched / totalDuration : 0;
  const points = Math.min(100, Math.max(0, Math.round(examAvg * 0.6 + watchRatio * 100 * 0.4)));

  return {
    examAvg: Math.round(examAvg),
    watchRatio,
    points,
    level: tierByPoints(points, tiers),
    completedLessons: completed,
    totalLessons: lessons.length,
    examsTaken: scores.length,
    totalExams: exams.length,
    watchedSeconds: totalWatched,
    progressPoints: progressPointsFromSeconds(totalWatched),
    examPoints: examPointsFromResults(examResults),
  };
}

/** مستوى/نقاط "لحظي" بسيط عند غياب محتوى (للأدمن أو قبل تحميل bootstrap). */
export function emptyStats(tiers: LevelTier[]): StudentStats {
  return {
    examAvg: 0,
    watchRatio: 0,
    points: 0,
    level: tierByPoints(0, tiers),
    completedLessons: 0,
    totalLessons: 0,
    examsTaken: 0,
    totalExams: 0,
    watchedSeconds: 0,
    progressPoints: 0,
    examPoints: 0,
  };
}
