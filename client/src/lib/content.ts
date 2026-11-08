import { api } from '../api/client';
import { getCached, getCachedStale, setCached, removeCached } from './cache';
import { getAllVideoProgressLocal, type VideoProgressLocal } from './localStore';

// ===== جلب المحتوى الكامل دفعة واحدة (bootstrap) مع كاش محلي =====

// TTL أطول (30 دقيقة) لتقليل طلبات الباك اند — المتصفح هو سيد الكاش.
export const BOOTSTRAP_TTL = 30 * 60_000;

// Content version for cache invalidation - incremented when content changes
export const CONTENT_VERSION = 1;

function bootstrapKey(userId: number): string {
  return `bootstrap:v${CONTENT_VERSION}:${userId}`;
}

/* ---- بصمة نسخة المحتوى على الخادم (توفير بيانات الموبايل) ---- */

const VERSION_KEY_PREFIX = 'bootstrap:ver:';

function readServerVersion(userId: number): string | null {
  try {
    return localStorage.getItem(VERSION_KEY_PREFIX + userId);
  } catch {
    return null;
  }
}

function writeServerVersion(userId: number, version: unknown): void {
  try {
    if (typeof version === 'string' && version) localStorage.setItem(VERSION_KEY_PREFIX + userId, version);
    else localStorage.removeItem(VERSION_KEY_PREFIX + userId);
  } catch {
    /* ignore */
  }
}

/** استجابة الخادم قد تكون المحتوى كاملاً أو إشعاراً بأنه لم يتغير. */
type BootstrapResponse = Partial<BootstrapData> & { notModified?: boolean; contentVersion?: string };

/** طلب واحد للـ bootstrap يدعم التحقق من البصمة، مع طلب كامل واحد عند الحاجة. */
async function fetchBootstrap(userId: number, signal: AbortSignal, useKnownVersion: boolean): Promise<BootstrapData> {
  const known = useKnownVersion ? readServerVersion(userId) : null;
  const path = known ? `/api/bootstrap?v=${encodeURIComponent(known)}` : '/api/bootstrap';
  const res = await api<BootstrapResponse>(path, { signal });

  if (res?.notModified) {
    writeServerVersion(userId, res.contentVersion);
    const stale = getCachedStale<BootstrapData>(bootstrapKey(userId));
    // لا نسخة محلية (تخزين مُسح مثلاً) ⇒ اطلب المحتوى كاملاً بلا بصمة.
    if (stale) return stale;
    return fetchBootstrap(userId, signal, false);
  }

  writeServerVersion(userId, res?.contentVersion);
  return res as BootstrapData;
}

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
  pdf: string;
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

interface InFlightBootstrap {
  promise: Promise<BootstrapData>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
}

/** في-الطريق لكل مستخدم حتى تشترك الصفحات في طلب واحد قابل للإلغاء بأمان. */
const inFlightByUser = new Map<number, InFlightBootstrap>();

/** ذاكرة الكاش في الذاكرة (Map) — قراءة فورية بدون localStorage parsing. */
const memoryCache = new Map<number, { data: BootstrapData; at: number }>();
const MEMORY_CACHE_TTL = 5 * 60_000; // 5 دقائق في الذاكرة

function subscribeToBootstrap(
  userId: number,
  flight: InFlightBootstrap,
  signal?: AbortSignal,
): Promise<BootstrapData> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
  }

  flight.consumers += 1;
  return new Promise<BootstrapData>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', onAbort);
      flight.consumers -= 1;
      if (
        flight.consumers === 0 &&
        !flight.settled &&
        inFlightByUser.get(userId) === flight
      ) {
        flight.controller.abort();
      }
    };
    const onAbort = () => {
      release();
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    flight.promise.then(
      (data) => {
        release();
        resolve(data);
      },
      (error: unknown) => {
        release();
        reject(error);
      },
    );
  });
}

/** يعيد المحتوى الكامل للمستخدم (مع كاش 30 دقيقة). */
export function loadBootstrap(userId: number, force = false, signal?: AbortSignal): Promise<BootstrapData> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
  }
  const key = bootstrapKey(userId);

  // 1. الذاكرة (أسرع)
  if (!force) {
    const mem = memoryCache.get(userId);
    if (mem && Date.now() - mem.at < MEMORY_CACHE_TTL) {
      return Promise.resolve(mem.data);
    }
  }

  // 2. localStorage
  if (!force) {
    const cached = getCached<BootstrapData>(key, BOOTSTRAP_TTL);
    if (cached) {
      memoryCache.set(userId, { data: cached, at: Date.now() });
      return Promise.resolve(cached);
    }
  }

  // 3. طلب قيد التنفيذ
  const existing = inFlightByUser.get(userId);
  if (existing) return subscribeToBootstrap(userId, existing, signal);

  const controller = new AbortController();
  let flight!: InFlightBootstrap;
  const promise = fetchBootstrap(userId, controller.signal, true)
    .then((data) => {
      setCached(key, data);
      memoryCache.set(userId, { data, at: Date.now() });
      return data;
    })
    .catch((err) => {
      if (err.name === 'AbortError') throw err;
      // فشل الشبكة/الخادم لا يعني فقدان البيانات: نعيد آخر نسخة مخزنة (حتى لو قديمة)
      const stale = getCachedStale<BootstrapData>(key);
      if (stale) {
        memoryCache.set(userId, { data: stale, at: Date.now() });
        return stale;
      }
      throw err;
    })
    .finally(() => {
      flight.settled = true;
      if (inFlightByUser.get(userId) === flight) inFlightByUser.delete(userId);
    });
  flight = {
    promise,
    controller,
    consumers: 0,
    settled: false,
  };
  inFlightByUser.set(userId, flight);
  return subscribeToBootstrap(userId, flight, signal);
}

export function getBootstrapSync(userId: number): BootstrapData | null {
  // لا نمنع قراءة البيانات المنتهية صلاحيتها هنا — نعرضها حتى تتجدد في الخلفية.
  const mem = memoryCache.get(userId);
  if (mem) return mem.data;
  return getCachedStale<BootstrapData>(bootstrapKey(userId));
}

export function invalidateBootstrap(userId: number): void {
  removeCached(bootstrapKey(userId));
  writeServerVersion(userId, null);
  memoryCache.delete(userId);
  inFlightByUser.get(userId)?.controller.abort();
  inFlightByUser.delete(userId);
}

// llamados when admin adds content (lesson, exam, note)
export function invalidateAllBootstrap(): void {
  // Clear all bootstrap caches for all users
  const keys = [...memoryCache.keys()];
  for (const userId of keys) {
    removeCached(bootstrapKey(userId));
    writeServerVersion(userId, null);
    memoryCache.delete(userId);
  }
  inFlightByUser.clear();
}

// Get current content version
export function getContentVersion(): number {
  return CONTENT_VERSION;
}

// Update content version (called after admin mutations)
export function bumpContentVersion(): void {
  // This would be called via a server-side mechanism or when user refreshes
}

/**
 * تنظيف كامل لكاش المستخدم عند تسجيل الخروج — يمنع بقاء محتوى/إحصائيات
 * الحساب السابق في الذاكرة (تسريب بيانات بين حسابين على نفس الجهاز).
 */
export function clearBootstrapCache(userId: number | null): void {
  if (userId != null) {
    removeCached(bootstrapKey(userId));
    writeServerVersion(userId, null);
    inFlightByUser.get(userId)?.controller.abort();
    inFlightByUser.delete(userId);
    memoryCache.delete(userId);
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

/* =================== أوائل كل الامتحانات =================== */

export interface ExamLeaderboardEntry {
  userId: number;
  fullName: string;
  score: number;
}

export interface ExamLeaderboard {
  examId: number;
  examTitle: string;
  examTitleEn: string;
  examGrade: string;
  top: ExamLeaderboardEntry[];
}

const LEADERBOARD_KEY = 'examLeaderboards';
const LEADERBOARD_TTL = 5 * 60_000;

export function loadExamLeaderboards(force = false): Promise<ExamLeaderboard[]> {
  if (!force) {
    const cached = getCached<ExamLeaderboard[]>(LEADERBOARD_KEY, LEADERBOARD_TTL);
    if (cached) return Promise.resolve(cached);
  }
  return api<{ leaderboards?: ExamLeaderboard[] }>('/api/exam-leaderboards')
    .then((d) => {
      const list = Array.isArray(d?.leaderboards) ? d.leaderboards : [];
      setCached(LEADERBOARD_KEY, list);
      return list;
    })
    .catch((e) => {
      const cached = getCachedStale<ExamLeaderboard[]>(LEADERBOARD_KEY);
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

/* =================== الفهرس العام (SEO) — بدون مصادقة =================== */

export interface PublicCourse {
  id: number;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  image: string;
  grade: string;
  gradeName: string;
  order: number;
  lessonCount: number;
  duration: number;
}

export interface PublicLesson {
  id: number;
  title: string;
  titleEn: string;
  duration: number;
  grade: string;
  order: number;
}

export interface PublicCourseDetail {
  course: PublicCourse;
  lessons: PublicLesson[];
  examsCount: number;
}

const PUBLIC_COURSES_KEY = 'publicCourses';
const PUBLIC_COURSES_TTL = 5 * 60_000;

export function loadPublicCourses(force = false): Promise<PublicCourse[]> {
  if (!force) {
    const cached = getCached<PublicCourse[]>(PUBLIC_COURSES_KEY, PUBLIC_COURSES_TTL);
    if (cached) return Promise.resolve(cached);
  }
  return api<{ courses?: PublicCourse[] }>('/api/public/courses')
    .then((d) => {
      const list = Array.isArray(d?.courses) ? d.courses : [];
      setCached(PUBLIC_COURSES_KEY, list);
      return list;
    })
    .catch((e) => {
      const cached = getCachedStale<PublicCourse[]>(PUBLIC_COURSES_KEY);
      if (cached) return cached;
      throw e;
    });
}

const PUBLIC_COURSE_TTL = 5 * 60_000;

export function loadPublicCourse(id: number): Promise<PublicCourseDetail> {
  const key = `publicCourse:${id}`;
  const cached = getCached<PublicCourseDetail>(key, PUBLIC_COURSE_TTL);
  if (cached) return Promise.resolve(cached);
  return api<PublicCourseDetail>(`/api/public/courses/${id}`)
    .then((d) => {
      setCached(key, d);
      return d;
    })
    .catch((e) => {
      const stale = getCachedStale<PublicCourseDetail>(key);
      if (stale) return stale;
      throw e;
    });
}
