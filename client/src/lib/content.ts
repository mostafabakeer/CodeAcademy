import { api } from '../api/client';
import { getCached, getCachedStale, setCached, removeCached } from './cache';
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

/** في-الطريق لكل مستخدم على حدة، حتى لا يتقاطع مستخدمان سريعان على نفس الكاش. */
const inFlightByUser = new Map<number, Promise<BootstrapData>>();

/** يعيد المحتوى الكامل للمستخدم (مع كاش 5 دقائق). */
export function loadBootstrap(userId: number, force = false, signal?: AbortSignal): Promise<BootstrapData> {
  const key = bootstrapKey(userId);
  if (!force) {
    const cached = getCached<BootstrapData>(key, BOOTSTRAP_TTL);
    if (cached) return Promise.resolve(cached);
  }
  const existing = inFlightByUser.get(userId);
  if (existing) return existing;
  const p = api<BootstrapData>('/api/bootstrap', { signal })
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .catch((err) => {
      if (err.name === 'AbortError') throw err; // إعادة رمي خطأ الإلغاء
      // فشل الشبكة/الخادم لا يعني فقدان البيانات: نعيد آخر نسخة مخزنة (حتى لو قديمة)
      // بدل إظهار صفحات فاضية بعد إعادة التحميل.
      const stale = getCachedStale<BootstrapData>(key);
      if (stale) return stale;
      throw err;
    })
    .finally(() => {
      if (inFlightByUser.get(userId) === p) inFlightByUser.delete(userId);
    });
  inFlightByUser.set(userId, p);
  return p;
}

export function getBootstrapSync(userId: number): BootstrapData | null {
  // لا نمنع قراءة البيانات المنتهية صلاحيتها هنا — نعرضها حتى تتجدد في الخلفية.
  return getCachedStale<BootstrapData>(bootstrapKey(userId));
}

export function invalidateBootstrap(userId: number): void {
  removeCached(bootstrapKey(userId));
}

/**
 * تنظيف كامل لكاش المستخدم عند تسجيل الخروج — يمنع بقاء محتوى/إحصائيات
 * الحساب السابق في الذاكرة (تسريب بيانات بين حسابين على نفس الجهاز).
 */
export function clearBootstrapCache(userId: number | null): void {
  if (userId != null) {
    removeCached(bootstrapKey(userId));
    inFlightByUser.delete(userId);
  }
  courseDetailCache.clear();
  lessonDetailCache.clear();
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

export interface LessonDetailData {
  lesson: LessonWithProgress;
  lessons: { id: number; title: string; titleEn: string }[];
}

// كاش للتفاصيل المحسوبة - المفتاح: courseId + hash بيانات المشاهدة
const courseDetailCache = new Map<string, CourseDetailData>();

function getWatchHash(watch: Record<number, VideoProgressLocal>): string {
  let hash = 0;
  for (const [id, v] of Object.entries(watch)) {
    hash = ((hash << 5) - hash) + id.charCodeAt(0) + v.seconds;
    hash |= 0;
  }
  return String(hash);
}

export function buildCourseDetail(b: BootstrapData, courseId: number): CourseDetailData | null {
  const course = b.courses.find((c) => c.id === courseId);
  if (!course) return null;
  const watch = getAllVideoProgressLocal();
  const watchHash = getWatchHash(watch);
  const cacheKey = `${courseId}:${watchHash}`;
  
  const cached = courseDetailCache.get(cacheKey);
  if (cached) return cached;
  
  const lessons = b.lessons
    .filter((l) => l.courseId === courseId)
    .map((l) => lessonWithProgress(l, watch))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const examsCount = b.exams.filter((e) => e.courseId === courseId).length;
  const data = { course, lessons, examsCount };
  
  courseDetailCache.set(cacheKey, data);
  return data;
}

// كاش لتفاصيل الدرس
const lessonDetailCache = new Map<string, LessonDetailData>();

export function buildLessonDetail(b: BootstrapData, lessonId: number): LessonDetailData | null {
  const lesson = b.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  const watch = getAllVideoProgressLocal();
  const watchHash = getWatchHash(watch);
  const cacheKey = `${lessonId}:${watchHash}`;
  
  const cached = lessonDetailCache.get(cacheKey);
  if (cached) return cached;
  
  const siblings = b.lessons
    .filter((l) => l.courseId === lesson.courseId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const data = {
    lesson: lessonWithProgress(lesson, watch),
    lessons: siblings.map((l) => ({ id: l.id, title: l.title, titleEn: l.titleEn })),
  };
  
  lessonDetailCache.set(cacheKey, data);
  return data;
}

export interface ExamListItem extends Exam {
  taken: boolean;
  bestScore: number | null;
  attempts: number;
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
      const students = Array.isArray(d?.students) ? d.students : [];
      setCached(TOP_KEY, students);
      return students;
    })
    .catch((e) => {
      const cached = getCachedStale<TopStudent[]>(TOP_KEY);
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
  return api<{ leaderboards?: Record<string, LatestExamTop> } & Record<string, unknown>>('/api/latest-exam-top')
    .then((d) => {
      // تأمين ضد أي شكل قديم من الخادم: نفضّل leaderboards، وإلا نستخدم الجسم مباشرة
      // لو بدا أنه خريطة المراحل نفسها، وإلا نرجع خريطة فارغة (لا undefined أبدًا).
      const lb = d?.leaderboards;
      const leaderboards =
        lb && typeof lb === 'object' && !Array.isArray(lb)
          ? (lb as Record<string, LatestExamTop>)
          : d && typeof d === 'object' && !Array.isArray(d) && ('bac1' in d || 'bac2' in d || 'all' in d)
            ? (d as unknown as Record<string, LatestExamTop>)
            : {};
      setCached(LATEST_TOP_KEY, leaderboards);
      return leaderboards;
    })
    .catch((e) => {
      const cached = getCachedStale<Record<string, LatestExamTop>>(LATEST_TOP_KEY);
      if (cached) return cached;
      throw e;
    });
}

/* =================== ترتيبي الحقيقي في آخر امتحان (خاص) =================== */

export interface MyExamRank {
  examId: number | null;
  examTitle: string;
  examTitleEn: string;
  score: number | null;
  rank: number | null;
  total: number;
  taken: boolean;
}

const MY_RANK_TTL = 60_000;

const EMPTY_MY_RANK: MyExamRank = {
  examId: null,
  examTitle: '',
  examTitleEn: '',
  score: null,
  rank: null,
  total: 0,
  taken: false,
};

/** ترتيب الطالب في آخر امتحان — يبقى null إن لم يشارك أو تعذّرت دقة الحساب (لا رقم مُلفّق). */
export function loadMyExamRank(userId: number, force = false): Promise<MyExamRank> {
  const key = `myExamRank:${userId}`;
  if (!force) {
    const cached = getCached<MyExamRank>(key, MY_RANK_TTL);
    if (cached) return Promise.resolve(cached);
  }
  return api<Partial<MyExamRank>>(`/api/my-exam-rank`)
    .then((d) => {
      const data: MyExamRank = {
        examId: typeof d?.examId === 'number' ? d.examId : null,
        examTitle: String(d?.examTitle ?? ''),
        examTitleEn: String(d?.examTitleEn ?? ''),
        score: typeof d?.score === 'number' ? d.score : null,
        rank: typeof d?.rank === 'number' ? d.rank : null,
        total: typeof d?.total === 'number' ? d.total : 0,
        taken: d?.taken === true,
      };
      setCached(key, data);
      return data;
    })
    .catch((e) => {
      const cached = getCachedStale<MyExamRank>(key);
      if (cached) return cached;
      return EMPTY_MY_RANK;
    });
}
