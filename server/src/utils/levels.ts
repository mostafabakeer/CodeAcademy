import type { AppStore } from '../db/store';
import { gradeAllowed } from './access';

export interface LevelTier {
  min: number;
  key: string;
  name: string;
  nameEn: string;
}

export const DEFAULT_LEVELS: LevelTier[] = [
  { min: 0, key: 'beginner', name: 'مبتدئ', nameEn: 'Beginner' },
  { min: 25, key: 'intermediate', name: 'متوسط', nameEn: 'Intermediate' },
  { min: 50, key: 'advanced', name: 'متقدم', nameEn: 'Advanced' },
  { min: 75, key: 'expert', name: 'محترف', nameEn: 'Expert' },
];

export interface StudentStats {
  examAvg: number;       // 0-100
  watchRatio: number;    // 0-1
  points: number;        // 0-100
  level: LevelTier;
  completedLessons: number;
  totalLessons: number;
  examsTaken: number;
  totalExams: number;
}

export async function computeStudentStats(store: AppStore, userId: number): Promise<StudentStats> {
  const user = await store.get<any>(`user:${userId}`);
  const studentGrade = user?.grade;

  // نتائج الامتحانات
  const results = await store.all<any>(`result:${userId}:`);
  const scores = results.map((r) => Number(r.value.best ?? r.value.score ?? 0)).filter((s) => !Number.isNaN(s));
  const examAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const allExams = await store.all<any>('exam:');
  const totalExams = allExams.filter(({ value }) => gradeAllowed(value.grade, studentGrade)).length;

  // الدروس والتقدم
  const lessons = (await store.all<any>('lesson:')).filter(({ value }) => gradeAllowed(value.grade, studentGrade));
  const progresses = await store.all<any>(`progress:${userId}:`);
  const watchByLesson = new Map(progresses.map((p) => [p.value.lessonId, Number(p.value.secondsWatched) || 0]));

  let totalDuration = 0;
  let totalWatched = 0;
  let completed = 0;
  for (const { value: lesson } of lessons) {
    const d = Number(lesson.duration) || 0;
    totalDuration += d;
    const w = Math.min(watchByLesson.get(lesson.id) ?? 0, d);
    totalWatched += w;
    if (d > 0 && w >= d * 0.9) completed++;
  }

  const watchRatio = totalDuration > 0 ? totalWatched / totalDuration : 0;
  const points = Math.min(100, Math.max(0, Math.round(examAvg * 0.6 + watchRatio * 100 * 0.4)));

  const levelsConfig = await store.get<{ tiers: LevelTier[] }>('config:levels');
  const tiers = (levelsConfig?.tiers?.length ? levelsConfig.tiers : DEFAULT_LEVELS).sort((a, b) => b.min - a.min);
  const level = tiers.find((t) => points >= t.min) ?? tiers[tiers.length - 1] ?? DEFAULT_LEVELS[0];

  return {
    examAvg: Math.round(examAvg),
    watchRatio,
    points,
    level,
    completedLessons: completed,
    totalLessons: lessons.length,
    examsTaken: scores.length,
    totalExams,
  };
}

export function tierByPoints(points: number, tiers: LevelTier[]): LevelTier {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  return sorted.find((t) => points >= t.min) ?? sorted[sorted.length - 1] ?? DEFAULT_LEVELS[0];
}
