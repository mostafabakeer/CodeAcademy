import { api } from '../api/client';
import { getCached, setCached, removeCached } from './cache';
import { getAllVideoProgressLocal, type VideoProgressLocal } from './localStore';

// ===== جلب المحتوى الكامل دفعة واحدة (bootstrap) مع كاش محلي =====

export const BOOTSTRAP_TTL = 5 * 60_000;

export interface Course {
  id: number;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  image: string;
  grade: string;
  order: number;
  createdAt: number;
}

export interface Lesson {
  id: number;
  courseId: number;
  title: string;
  titleEn: string;
  videoType: 'youtube' | 'upload';
  videoUrl: string;
  duration: number;
  description: string;
  descriptionEn: string;
  grade: string;
  order: number;
  createdAt: number;
}

export interface Exam {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  timeLimit: number | null;
  passingScore: number;
  grade: string;
  allowRetake: boolean;
  order: number;
  createdAt: number;
  questionsCount: number;
}

export interface Note {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  body: string;
  bodyEn: string;
  image: string;
  grade: string;
  order: number;
  createdAt: number;
}

export interface TopStudent {
  id: number;
  name: string;
  image: string;
  rank: number;
  grade: string;
  gradeName: string;
}

export interface BootstrapData {
  courses: Course[];
  lessons: Lesson[];
  exams: Exam[];
  notes: Note[];
  topStudents: TopStudent[];
  levels: { min: number; key: string; name: string; nameEn: string }[];
  grades: Record<string, { name: string; nameEn: string }>;
}

function bootstrapKey(userId: number): string {
  return `bootstrap:${userId}`;
}

let inFlight: Promise<BootstrapData> | null = null;

/** يعيد المحتوى الكامل للمستخدم (مع كاش 5 دقائق). */
export function loadBootstrap(userId: number, force = false): Promise<BootstrapData> {
  const key = bootstrapKey(userId);
  if (!force) {
    const cached = getCached<BootstrapData>(key, BOOTSTRAP_TTL);
    if (cached) return Promise.resolve(cached);
  }
  if (inFlight) return inFlight;
  inFlight = api<BootstrapData>('/api/bootstrap')
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function getBootstrapSync(userId: number): BootstrapData | null {
  return getCached<BootstrapData>(bootstrapKey(userId), BOOTSTRAP_TTL);
}

export function invalidateBootstrap(userId: number): void {
  removeCached(bootstrapKey(userId));
}

/* =================== بناء البيانات (من bootstrap + المشاهدة المحلية) =================== */

export interface CourseWithProgress extends Course {
  lessonCount: number;
  completedLessons: number;
  duration: number;
  watchedSeconds: number;
  progress: number;
}

export interface LessonWithProgress extends Lesson {
  watchedSeconds: number;
  completed: boolean;
  progressPct: number;
}

export function watchFor(lessonId: number, watch: Record<number, VideoProgressLocal>): number {
  return watch[lessonId]?.seconds ?? 0;
}

function lessonWithProgress(l: Lesson, watch: Record<number, VideoProgressLocal>): LessonWithProgress {
  const d = Number(l.duration) || 0;
  const w = Math.min(watchFor(l.id, watch), d);
  return { ...l, watchedSeconds: w, completed: d > 0 && w >= d * 0.9, progressPct: d > 0 ? Math.round((w / d) * 100) : 0 };
}

export function buildCourseList(b: BootstrapData, watch: Record<number, VideoProgressLocal>): CourseWithProgress[] {
  return b.courses.map((course) => {
    const courseLessons = b.lessons.filter((l) => l.courseId === course.id);
    let duration = 0;
    let watched = 0;
    let completed = 0;
    for (const l of courseLessons) {
      const d = Number(l.duration) || 0;
      duration += d;
      const w = Math.min(watchFor(l.id, watch), d);
      watched += w;
      if (d > 0 && w >= d * 0.9) completed++;
    }
    return {
      ...course,
      lessonCount: courseLessons.length,
      completedLessons: completed,
      duration,
      watchedSeconds: watched,
      progress: duration > 0 ? Math.round((watched / duration) * 100) : 0,
    };
  });
}

export interface CourseDetailData {
  course: Course;
  lessons: LessonWithProgress[];
  examsCount: number;
}

export function buildCourseDetail(b: BootstrapData, courseId: number): CourseDetailData | null {
  const course = b.courses.find((c) => c.id === courseId);
  if (!course) return null;
  const watch = getAllVideoProgressLocal();
  const lessons = b.lessons
    .filter((l) => l.courseId === courseId)
    .map((l) => lessonWithProgress(l, watch))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const examsCount = b.exams.filter((e) => e.courseId === courseId).length;
  return { course, lessons, examsCount };
}

export interface LessonDetailData {
  lesson: LessonWithProgress;
  lessons: { id: number; title: string; titleEn: string }[];
}

export function buildLessonDetail(b: BootstrapData, lessonId: number): LessonDetailData | null {
  const lesson = b.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  const watch = getAllVideoProgressLocal();
  const siblings = b.lessons
    .filter((l) => l.courseId === lesson.courseId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    lesson: lessonWithProgress(lesson, watch),
    lessons: siblings.map((l) => ({ id: l.id, title: l.title, titleEn: l.titleEn })),
  };
}

export interface ExamListItem extends Exam {
  taken: boolean;
  bestScore: number | null;
  attempts: number;
}

export function buildExamList(b: BootstrapData, examResults: { examId: number; best: number; attempts: number }[]): ExamListItem[] {
  const map = new Map(examResults.map((r) => [r.examId, r]));
  return b.exams.map((e) => {
    const r = map.get(e.id);
    return { ...e, taken: !!r, bestScore: r?.best ?? null, attempts: r?.attempts ?? 0 };
  });
}

/* =================== أوائل الطلبة (عام / متاح بدون اشتراك) =================== */

const TOP_KEY = 'topStudents';
const TOP_TTL = 5 * 60_000;

export function loadTopStudents(force = false): Promise<TopStudent[]> {
  if (!force) {
    const cached = getCached<TopStudent[]>(TOP_KEY, TOP_TTL);
    if (cached) return Promise.resolve(cached);
  }
  return api<{ students: TopStudent[] }>('/api/top-students')
    .then((d) => {
      setCached(TOP_KEY, d.students);
      return d.students;
    })
    .catch((e) => {
      const cached = getCached<TopStudent[]>(TOP_KEY, TOP_TTL);
      if (cached) return cached;
      throw e;
    });
}

/* =================== أوائل الامتحان الأخير (فرعي، تلقائي من النتائج) =================== */

export interface LatestExamTopEntry {
  userId: number;
  fullName: string;
  score: number;
}

export interface LatestExamTop {
  examId: number | null;
  examTitle: string;
  examTitleEn: string;
  top: LatestExamTopEntry[];
}

const LATEST_TOP_KEY = 'latestExamTop';
const LATEST_TOP_TTL = 60_000;

export function loadLatestExamTop(force = false): Promise<Record<string, LatestExamTop>> {
  if (!force) {
    const cached = getCached<Record<string, LatestExamTop>>(LATEST_TOP_KEY, LATEST_TOP_TTL);
    if (cached) return Promise.resolve(cached);
  }
  return api<{ leaderboards: Record<string, LatestExamTop> }>('/api/latest-exam-top')
    .then((d) => {
      setCached(LATEST_TOP_KEY, d.leaderboards);
      return d.leaderboards;
    })
    .catch((e) => {
      const cached = getCached<Record<string, LatestExamTop>>(LATEST_TOP_KEY, LATEST_TOP_TTL);
      if (cached) return cached;
      throw e;
    });
}
