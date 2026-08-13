import * as userService from './userService';
import * as examService from './examService';
import * as lessonService from './lessonService';
import * as progressService from './progressService';
import * as resultService from './resultService';
import * as configService from './configService';
import { tierByPoints, type LevelTier } from '../utils/levels';
import { gradeAllowed } from '../utils/access';

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

export async function computeStudentStats(userId: number): Promise<StudentStats> {
  const user = await userService.getById(userId);
  const studentGrade = user?.grade;

  // نتائج الامتحانات
  const results = await resultService.listByUser(userId);
  const scores = results.map((r) => Number(r.best ?? r.score ?? 0)).filter((s) => !Number.isNaN(s));
  const examAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const allExams = await examService.listAll();
  const totalExams = allExams.filter(({ grade }) => gradeAllowed(grade, studentGrade)).length;

  // الدروس والتقدم
  const lessons = (await lessonService.listAll()).filter(({ grade }) => gradeAllowed(grade, studentGrade));
  const progresses = await progressService.listByUser(userId);
  const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

  let totalDuration = 0;
  let totalWatched = 0;
  let completed = 0;
  for (const lesson of lessons) {
    const d = Number(lesson.duration) || 0;
    totalDuration += d;
    const w = Math.min(watchByLesson.get(lesson.id) ?? 0, d);
    totalWatched += w;
    if (d > 0 && w >= d * 0.9) completed++;
  }

  const watchRatio = totalDuration > 0 ? totalWatched / totalDuration : 0;
  const points = Math.min(100, Math.max(0, Math.round(examAvg * 0.6 + watchRatio * 100 * 0.4)));

  const { tiers } = await configService.getLevels();
  const level = tierByPoints(points, tiers);

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
