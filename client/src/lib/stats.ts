import type { VideoProgressLocal } from './localStore';

// ===== حساب إحصائيات الطالب في المتصفح (نفس معادلة الباك اند) =====

export interface LevelTier {
  min: number;
  key: string;
  name: string;
  nameEn: string;
}

export interface StudentStats {
  examAvg: number;
  watchRatio: number;
  points: number;
  level: LevelTier;
  completedLessons: number;
  totalLessons: number;
  examsTaken: number;
  totalExams: number;
}

export interface LessonLike {
  id: number;
  duration: number;
}

export function tierByPoints(points: number, tiers: LevelTier[]): LevelTier {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  return sorted.find((t) => points >= t.min) ?? sorted[sorted.length - 1] ?? { min: 0, key: 'beginner', name: 'مبتدئ', nameEn: 'Beginner' };
}

export interface ExamResultLike {
  examId: number;
  best: number;
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
  };
}
