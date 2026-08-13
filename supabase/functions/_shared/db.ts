import { sb } from './supabase.ts';
import { tierByPoints, DEFAULT_LEVELS, type LevelTier } from './levels.ts';
import { gradeAllowed } from './access.ts';

/* =================== عام =================== */

function now(): number {
  return Date.now();
}

/** توحيد صيغة رقم التليفون المصري حتى لا يتأثر تسجيل الدخول باختلاف الكتابة
 *  (+20 / 00 / بدون مفتاح) ويبقى الاستعلام مستقلاً عن صيغة التخزين القديمة. */
export function normalizePhone(raw: string): string {
  let p = String(raw ?? '').replace(/[\s()-]/g, '').trim();
  if (!p) return '';
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('20') && p.length === 12) p = p.slice(2);
  if (p.length === 10 && p.startsWith('1')) p = '0' + p;
  return p;
}

/* =================== المستخدمون =================== */

export interface DbUser {
  id: number;
  fullName: string;
  username?: string;
  phone: string;
  grade: string;
  role: 'student' | 'admin';
  subscription: boolean;
  blocked: boolean;
  passwordHash: string;
  createdAt: number;
}

export type SafeUser = Omit<DbUser, 'passwordHash'>;

function userFromRow(r: any): DbUser {
  return {
    id: r.id,
    fullName: r.full_name ?? '',
    username: r.username ?? undefined,
    phone: r.phone ?? '',
    grade: r.grade ?? 'all',
    role: r.role === 'admin' ? 'admin' : 'student',
    subscription: !!r.subscription,
    blocked: !!r.blocked,
    passwordHash: r.password_hash ?? '',
    createdAt: r.created_at ?? 0,
  };
}

function userToRow(u: Partial<DbUser>): Record<string, any> {
  const row: Record<string, any> = {};
  if (u.fullName !== undefined) row.full_name = u.fullName;
  if (u.username !== undefined) row.username = u.username;
  if (u.phone !== undefined) row.phone = u.phone;
  if (u.grade !== undefined) row.grade = u.grade;
  if (u.role !== undefined) row.role = u.role;
  if (u.subscription !== undefined) row.subscription = u.subscription;
  if (u.blocked !== undefined) row.blocked = u.blocked;
  if (u.passwordHash !== undefined) row.password_hash = u.passwordHash;
  if (u.createdAt !== undefined) row.created_at = u.createdAt;
  return row;
}

export function safeUser(u: DbUser): SafeUser {
  const { passwordHash: _omit, ...safe } = u;
  return safe;
}

export async function countUsers(): Promise<number> {
  const { count } = await sb.from('users').select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function countAdmins(): Promise<number> {
  const { count } = await sb.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin');
  return count ?? 0;
}

export async function findUserById(id: number): Promise<DbUser | null> {
  const { data } = await sb.from('users').select('*').eq('id', id).maybeSingle();
  return data ? userFromRow(data) : null;
}

export async function findUserByPhone(normPhone: string): Promise<DbUser | null> {
  const target = normalizePhone(normPhone);
  const { data } = await sb.from('users').select('*');
  const rows = data ?? [];
  const found = rows.find((r) => normalizePhone(String(r.phone ?? '')) === target && target.length > 0);
  return found ? userFromRow(found) : null;
}

/** بحث بالتليفون (بعد التوحيد) أو باسم المستخدم (username). */
export async function findUserByIdentifier(identifier: string): Promise<DbUser | null> {
  const raw = String(identifier);
  const norm = normalizePhone(raw);
  const { data } = await sb.from('users').select('*');
  const rows = data ?? [];
  const found = rows.find((r) => {
    if (norm && normalizePhone(String(r.phone ?? '')) === norm) return true;
    return String(r.username ?? '') === raw;
  });
  return found ? userFromRow(found) : null;
}

export async function createUser(input: Omit<DbUser, 'id'>): Promise<DbUser> {
  const { data } = await sb.from('users').insert(userToRow(input)).select().single();
  return userFromRow(data);
}

export async function updateUser(id: number, patch: Partial<Omit<DbUser, 'id'>>): Promise<DbUser | null> {
  const row = userToRow(patch);
  if (Object.keys(row).length === 0) return findUserById(id);
  const { data } = await sb.from('users').update(row).eq('id', id).select().maybeSingle();
  return data ? userFromRow(data) : null;
}

export async function listUsers(params: { page?: number; limit?: number; search?: string } = {}): Promise<{ users: SafeUser[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
  const search = params.search?.trim() ?? '';

  let query = sb.from('users').select('*', { count: 'exact' });
  if (search) {
    const safe = search.replace(/[(),*.]/g, '');
    const like = `%${safe}%`;
    query = query.or(`full_name.ilike.${like},phone.ilike.${like},username.ilike.${like}`) as any;
  }
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, count } = await query.order('id', { ascending: true }).range(from, to);

  return {
    users: (data ?? []).map((r) => safeUser(userFromRow(r))),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function listAllUsers(): Promise<DbUser[]> {
  const { data } = await sb.from('users').select('*').order('id', { ascending: true });
  return (data ?? []).map(userFromRow);
}

/* =================== الكورسات =================== */

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

function courseFromRow(r: any): Course {
  return {
    id: r.id,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    description: r.description ?? '',
    descriptionEn: r.description_en ?? '',
    image: r.image ?? '',
    grade: r.grade ?? 'all',
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function courseToRow(c: Partial<Course>): Record<string, any> {
  const row: Record<string, any> = {};
  if (c.title !== undefined) row.title = c.title;
  if (c.titleEn !== undefined) row.title_en = c.titleEn;
  if (c.description !== undefined) row.description = c.description;
  if (c.descriptionEn !== undefined) row.description_en = c.descriptionEn;
  if (c.image !== undefined) row.image = c.image;
  if (c.grade !== undefined) row.grade = c.grade;
  if (c.order !== undefined) row.order = c.order;
  if (c.createdAt !== undefined) row.created_at = c.createdAt;
  return row;
}

export async function listCourses(): Promise<Course[]> {
  const { data } = await sb.from('courses').select('*').order('order', { ascending: true });
  return (data ?? []).map(courseFromRow);
}

export async function findCourseById(id: number): Promise<Course | null> {
  const { data } = await sb.from('courses').select('*').eq('id', id).maybeSingle();
  return data ? courseFromRow(data) : null;
}

export async function createCourse(input: Omit<Course, 'id'>): Promise<Course> {
  const { data } = await sb.from('courses').insert(courseToRow(input)).select().single();
  return courseFromRow(data);
}

export async function updateCourse(id: number, patch: Partial<Omit<Course, 'id'>>): Promise<Course | null> {
  const row = courseToRow(patch);
  if (Object.keys(row).length === 0) return findCourseById(id);
  const { data } = await sb.from('courses').update(row).eq('id', id).select().maybeSingle();
  return data ? courseFromRow(data) : null;
}

export async function deleteCourse(id: number): Promise<void> {
  await sb.from('courses').delete().eq('id', id);
}

/* =================== الدروس =================== */

export interface Lesson {
  id: number;
  courseId: number;
  title: string;
  titleEn: string;
  videoType: string;
  videoUrl: string;
  duration: number;
  description: string;
  descriptionEn: string;
  grade: string;
  order: number;
  createdAt: number;
}

function lessonFromRow(r: any): Lesson {
  return {
    id: r.id,
    courseId: r.course_id ?? 0,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    videoType: r.video_type ?? 'youtube',
    videoUrl: r.video_url ?? '',
    duration: r.duration ?? 0,
    description: r.description ?? '',
    descriptionEn: r.description_en ?? '',
    grade: r.grade ?? 'all',
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function lessonToRow(l: Partial<Lesson>): Record<string, any> {
  const row: Record<string, any> = {};
  if (l.courseId !== undefined) row.course_id = l.courseId;
  if (l.title !== undefined) row.title = l.title;
  if (l.titleEn !== undefined) row.title_en = l.titleEn;
  if (l.videoType !== undefined) row.video_type = l.videoType;
  if (l.videoUrl !== undefined) row.video_url = l.videoUrl;
  if (l.duration !== undefined) row.duration = l.duration;
  if (l.description !== undefined) row.description = l.description;
  if (l.descriptionEn !== undefined) row.description_en = l.descriptionEn;
  if (l.grade !== undefined) row.grade = l.grade;
  if (l.order !== undefined) row.order = l.order;
  if (l.createdAt !== undefined) row.created_at = l.createdAt;
  return row;
}

export async function listAllLessons(): Promise<Lesson[]> {
  const { data } = await sb.from('lessons').select('*').order('order', { ascending: true });
  return (data ?? []).map(lessonFromRow);
}

export async function findLessonById(id: number): Promise<Lesson | null> {
  const { data } = await sb.from('lessons').select('*').eq('id', id).maybeSingle();
  return data ? lessonFromRow(data) : null;
}

export async function createLesson(input: Omit<Lesson, 'id'>): Promise<Lesson> {
  const { data } = await sb.from('lessons').insert(lessonToRow(input)).select().single();
  return lessonFromRow(data);
}

export async function updateLesson(id: number, patch: Partial<Omit<Lesson, 'id'>>): Promise<Lesson | null> {
  const row = lessonToRow(patch);
  if (Object.keys(row).length === 0) return findLessonById(id);
  const { data } = await sb.from('lessons').update(row).eq('id', id).select().maybeSingle();
  return data ? lessonFromRow(data) : null;
}

export async function deleteLesson(id: number): Promise<void> {
  await sb.from('lessons').delete().eq('id', id);
}

/* =================== الامتحانات =================== */

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
}

function examFromRow(r: any): Exam {
  return {
    id: r.id,
    courseId: r.course_id ?? null,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    timeLimit: r.time_limit ?? null,
    passingScore: r.passing_score ?? 50,
    grade: r.grade ?? 'all',
    allowRetake: !!r.allow_retake,
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function examToRow(e: Partial<Exam>): Record<string, any> {
  const row: Record<string, any> = {};
  if (e.courseId !== undefined) row.course_id = e.courseId;
  if (e.title !== undefined) row.title = e.title;
  if (e.titleEn !== undefined) row.title_en = e.titleEn;
  if (e.timeLimit !== undefined) row.time_limit = e.timeLimit;
  if (e.passingScore !== undefined) row.passing_score = e.passingScore;
  if (e.grade !== undefined) row.grade = e.grade;
  if (e.allowRetake !== undefined) row.allow_retake = e.allowRetake;
  if (e.order !== undefined) row.order = e.order;
  if (e.createdAt !== undefined) row.created_at = e.createdAt;
  return row;
}

export async function listExams(): Promise<Exam[]> {
  const { data } = await sb.from('exams').select('*').order('order', { ascending: true });
  return (data ?? []).map(examFromRow);
}

export async function findExamById(id: number): Promise<Exam | null> {
  const { data } = await sb.from('exams').select('*').eq('id', id).maybeSingle();
  return data ? examFromRow(data) : null;
}

export async function createExam(input: Omit<Exam, 'id'>): Promise<Exam> {
  const { data } = await sb.from('exams').insert(examToRow(input)).select().single();
  return examFromRow(data);
}

export async function updateExam(id: number, patch: Partial<Omit<Exam, 'id'>>): Promise<Exam | null> {
  const row = examToRow(patch);
  if (Object.keys(row).length === 0) return findExamById(id);
  const { data } = await sb.from('exams').update(row).eq('id', id).select().maybeSingle();
  return data ? examFromRow(data) : null;
}

export async function deleteExam(id: number): Promise<void> {
  await sb.from('exams').delete().eq('id', id);
}

/* =================== الأسئلة =================== */

export interface Question {
  id: number;
  examId: number;
  text: string;
  textEn: string;
  options: { text: string; textEn: string }[];
  correctIndex: number;
  image: string;
  order: number;
}

function questionFromRow(r: any): Question {
  return {
    id: r.id,
    examId: r.exam_id ?? 0,
    text: r.text ?? '',
    textEn: r.text_en ?? '',
    options: Array.isArray(r.options) ? r.options : [],
    correctIndex: r.correct_index ?? 0,
    image: r.image ?? '',
    order: r.order ?? 0,
  };
}

function questionToRow(q: Partial<Question>): Record<string, any> {
  const row: Record<string, any> = {};
  if (q.examId !== undefined) row.exam_id = q.examId;
  if (q.text !== undefined) row.text = q.text;
  if (q.textEn !== undefined) row.text_en = q.textEn;
  if (q.options !== undefined) row.options = q.options;
  if (q.correctIndex !== undefined) row.correct_index = q.correctIndex;
  if (q.image !== undefined) row.image = q.image;
  if (q.order !== undefined) row.order = q.order;
  return row;
}

export async function listQuestionsByExam(examId: number): Promise<Question[]> {
  const { data } = await sb.from('questions').select('*').eq('exam_id', examId).order('order', { ascending: true });
  return (data ?? []).map(questionFromRow);
}

export async function findQuestionById(id: number): Promise<Question | null> {
  const { data } = await sb.from('questions').select('*').eq('id', id).maybeSingle();
  return data ? questionFromRow(data) : null;
}

export async function createQuestion(input: Omit<Question, 'id'>): Promise<Question> {
  const { data } = await sb.from('questions').insert(questionToRow(input)).select().single();
  return questionFromRow(data);
}

export async function updateQuestion(id: number, patch: Partial<Omit<Question, 'id'>>): Promise<Question | null> {
  const row = questionToRow(patch);
  if (Object.keys(row).length === 0) return findQuestionById(id);
  const { data } = await sb.from('questions').update(row).eq('id', id).select().maybeSingle();
  return data ? questionFromRow(data) : null;
}

export async function deleteQuestion(id: number): Promise<void> {
  await sb.from('questions').delete().eq('id', id);
}

/* =================== المذكرات =================== */

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

function noteFromRow(r: any): Note {
  return {
    id: r.id,
    courseId: r.course_id ?? null,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    body: r.body ?? '',
    bodyEn: r.body_en ?? '',
    image: r.image ?? '',
    grade: r.grade ?? 'all',
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function noteToRow(n: Partial<Note>): Record<string, any> {
  const row: Record<string, any> = {};
  if (n.courseId !== undefined) row.course_id = n.courseId;
  if (n.title !== undefined) row.title = n.title;
  if (n.titleEn !== undefined) row.title_en = n.titleEn;
  if (n.body !== undefined) row.body = n.body;
  if (n.bodyEn !== undefined) row.body_en = n.bodyEn;
  if (n.image !== undefined) row.image = n.image;
  if (n.grade !== undefined) row.grade = n.grade;
  if (n.order !== undefined) row.order = n.order;
  if (n.createdAt !== undefined) row.created_at = n.createdAt;
  return row;
}

export async function listNotes(): Promise<Note[]> {
  const { data } = await sb.from('notes').select('*').order('order', { ascending: true });
  return (data ?? []).map(noteFromRow);
}

export async function findNoteById(id: number): Promise<Note | null> {
  const { data } = await sb.from('notes').select('*').eq('id', id).maybeSingle();
  return data ? noteFromRow(data) : null;
}

export async function createNote(input: Omit<Note, 'id'>): Promise<Note> {
  const { data } = await sb.from('notes').insert(noteToRow(input)).select().single();
  return noteFromRow(data);
}

export async function updateNote(id: number, patch: Partial<Omit<Note, 'id'>>): Promise<Note | null> {
  const row = noteToRow(patch);
  if (Object.keys(row).length === 0) return findNoteById(id);
  const { data } = await sb.from('notes').update(row).eq('id', id).select().maybeSingle();
  return data ? noteFromRow(data) : null;
}

export async function deleteNote(id: number): Promise<void> {
  await sb.from('notes').delete().eq('id', id);
}

/* =================== أوائل الطلبة =================== */

export interface TopStudent {
  id: number;
  name: string;
  image: string;
  rank: number;
  grade: string;
  createdAt: number;
}

function topFromRow(r: any): TopStudent {
  return {
    id: r.id,
    name: r.name ?? '',
    image: r.image ?? '',
    rank: r.rank ?? 1,
    grade: r.grade ?? 'bac1',
    createdAt: r.created_at ?? 0,
  };
}

function topToRow(t: Partial<TopStudent>): Record<string, any> {
  const row: Record<string, any> = {};
  if (t.name !== undefined) row.name = t.name;
  if (t.image !== undefined) row.image = t.image;
  if (t.rank !== undefined) row.rank = t.rank;
  if (t.grade !== undefined) row.grade = t.grade;
  if (t.createdAt !== undefined) row.created_at = t.createdAt;
  return row;
}

export async function listTopStudents(): Promise<TopStudent[]> {
  const { data } = await sb.from('top_students').select('*');
  return (data ?? []).map(topFromRow);
}

export async function findTopStudentById(id: number): Promise<TopStudent | null> {
  const { data } = await sb.from('top_students').select('*').eq('id', id).maybeSingle();
  return data ? topFromRow(data) : null;
}

export async function createTopStudent(input: Omit<TopStudent, 'id'>): Promise<TopStudent> {
  const { data } = await sb.from('top_students').insert(topToRow(input)).select().single();
  return topFromRow(data);
}

export async function updateTopStudent(id: number, patch: Partial<Omit<TopStudent, 'id'>>): Promise<TopStudent | null> {
  const row = topToRow(patch);
  if (Object.keys(row).length === 0) return findTopStudentById(id);
  const { data } = await sb.from('top_students').update(row).eq('id', id).select().maybeSingle();
  return data ? topFromRow(data) : null;
}

export async function deleteTopStudent(id: number): Promise<void> {
  await sb.from('top_students').delete().eq('id', id);
}

/* =================== التقدم =================== */

export interface Progress {
  userId: number;
  lessonId: number;
  secondsWatched: number;
  completed: boolean;
  updatedAt: number;
}

function progressFromRow(r: any): Progress {
  return {
    userId: r.user_id,
    lessonId: r.lesson_id,
    secondsWatched: r.seconds_watched ?? 0,
    completed: !!r.completed,
    updatedAt: r.updated_at ?? 0,
  };
}

function progressToRow(p: Partial<Progress>): Record<string, any> {
  const row: Record<string, any> = {};
  if (p.userId !== undefined) row.user_id = p.userId;
  if (p.lessonId !== undefined) row.lesson_id = p.lessonId;
  if (p.secondsWatched !== undefined) row.seconds_watched = p.secondsWatched;
  if (p.completed !== undefined) row.completed = p.completed;
  if (p.updatedAt !== undefined) row.updated_at = p.updatedAt;
  return row;
}

export async function getProgress(userId: number, lessonId: number): Promise<Progress | null> {
  const { data } = await sb.from('progress').select('*').eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle();
  return data ? progressFromRow(data) : null;
}

export async function listProgressByUser(userId: number): Promise<Progress[]> {
  const { data } = await sb.from('progress').select('*').eq('user_id', userId);
  return (data ?? []).map(progressFromRow);
}

export interface WatchOutcome {
  progress: Progress;
  completed: boolean;
  duration: number;
}

/**
 * تحديث مدة المشاهدة لدرس: يحسب completed عند 90% من المدة.
 * يعيد null لو الدرس غير موجود.
 */
export async function upsertWatch(userId: number, lessonId: number, seconds: number): Promise<WatchOutcome | null> {
  const lesson = await findLessonById(lessonId);
  if (!lesson) return null;

  const existing = (await getProgress(userId, lessonId)) ?? { userId, lessonId, secondsWatched: 0, completed: false, updatedAt: 0 };
  const duration = Number(lesson.duration) || 0;
  const watched = Math.max(existing.secondsWatched || 0, Math.min(Number(seconds), duration));
  const completed = duration > 0 ? watched >= duration * 0.9 : false;

  const progress: Progress = { ...existing, secondsWatched: watched, completed, updatedAt: now() };
  await sb.from('progress').upsert(progressToRow(progress), { onConflict: 'user_id,lesson_id' });

  return { progress, completed, duration };
}

/* =================== نتائج الامتحانات =================== */

export interface ExamResult {
  userId: number;
  examId: number;
  best: number;
  score: number;
  correct: number;
  total: number;
  attempts: number;
  answers: Record<string, number>;
  history: { at: number; score: number; correct: number; total: number }[];
  at: number;
}

function resultFromRow(r: any): ExamResult {
  return {
    userId: r.user_id,
    examId: r.exam_id,
    best: r.best ?? 0,
    score: r.score ?? 0,
    correct: r.correct ?? 0,
    total: r.total ?? 0,
    attempts: r.attempts ?? 0,
    answers: r.answers ?? {},
    history: Array.isArray(r.history) ? r.history : [],
    at: r.at ?? 0,
  };
}

function resultToRow(r: Partial<ExamResult>): Record<string, any> {
  const row: Record<string, any> = {};
  if (r.userId !== undefined) row.user_id = r.userId;
  if (r.examId !== undefined) row.exam_id = r.examId;
  if (r.best !== undefined) row.best = r.best;
  if (r.score !== undefined) row.score = r.score;
  if (r.correct !== undefined) row.correct = r.correct;
  if (r.total !== undefined) row.total = r.total;
  if (r.attempts !== undefined) row.attempts = r.attempts;
  if (r.answers !== undefined) row.answers = r.answers;
  if (r.history !== undefined) row.history = r.history;
  if (r.at !== undefined) row.at = r.at;
  return row;
}

export async function getResult(userId: number, examId: number): Promise<ExamResult | null> {
  const { data } = await sb.from('exam_results').select('*').eq('user_id', userId).eq('exam_id', examId).maybeSingle();
  return data ? resultFromRow(data) : null;
}

export async function upsertResult(result: ExamResult): Promise<void> {
  await sb.from('exam_results').upsert(resultToRow(result), { onConflict: 'user_id,exam_id' });
}

export async function listResultsByUser(userId: number): Promise<ExamResult[]> {
  const { data } = await sb.from('exam_results').select('*').eq('user_id', userId);
  return (data ?? []).map(resultFromRow);
}

/* =================== ملفات الكود =================== */

export interface CodeFile {
  id: number;
  userId: number;
  name: string;
  language: string;
  code: string;
  versions: { at: number; code: string }[];
  createdAt: number;
  updatedAt: number;
}

const MAX_VERSIONS = 20;
const MAX_HISTORY = 20;

function codeFromRow(r: any): CodeFile {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name ?? 'ملف جديد',
    language: r.language ?? 'javascript',
    code: r.code ?? '',
    versions: Array.isArray(r.versions) ? r.versions : [],
    createdAt: r.created_at ?? 0,
    updatedAt: r.updated_at ?? 0,
  };
}

function codeToRow(f: Partial<CodeFile>): Record<string, any> {
  const row: Record<string, any> = {};
  if (f.userId !== undefined) row.user_id = f.userId;
  if (f.name !== undefined) row.name = f.name;
  if (f.language !== undefined) row.language = f.language;
  if (f.code !== undefined) row.code = f.code;
  if (f.versions !== undefined) row.versions = f.versions;
  if (f.createdAt !== undefined) row.created_at = f.createdAt;
  if (f.updatedAt !== undefined) row.updated_at = f.updatedAt;
  return row;
}

export async function listCodeFilesByUser(userId: number): Promise<CodeFile[]> {
  const { data } = await sb.from('code_files').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  return (data ?? []).map(codeFromRow);
}

export async function getCodeFileByUser(userId: number, id: number): Promise<CodeFile | null> {
  const { data } = await sb.from('code_files').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  return data ? codeFromRow(data) : null;
}

export async function createCodeFile(userId: number, input: { name: string; language: string; code: string }): Promise<CodeFile> {
  const at = now();
  const file: Omit<CodeFile, 'id'> = {
    userId,
    name: input.name,
    language: input.language,
    code: input.code,
    versions: [{ at, code: input.code }],
    createdAt: at,
    updatedAt: at,
  };

  const { data } = await sb.from('code_files').insert(codeToRow(file)).select().single();
  return codeFromRow(data);
}

export async function updateCodeFile(userId: number, id: number, code: string): Promise<CodeFile | null> {
  const file = await getCodeFileByUser(userId, id);
  if (!file) return null;
  if (code === file.code) return file;

  const at = now();
  const versions = [...(file.versions ?? []).slice(-(MAX_VERSIONS - 1)), { at, code }];
  const { data } = await sb
    .from('code_files')
    .update(codeToRow({ code, versions, updatedAt: at }))
    .eq('id', id)
    .select()
    .maybeSingle();
  return data ? codeFromRow(data) : null;
}

export async function patchCodeFile(userId: number, id: number, patch: { name?: string; language?: string }): Promise<CodeFile | null> {
  const file = await getCodeFileByUser(userId, id);
  if (!file) return null;
  const updated: CodeFile = {
    ...file,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.language !== undefined ? { language: patch.language } : {}),
  };
  if (updated.name === file.name && updated.language === file.language) return file;
  const { data } = await sb
    .from('code_files')
    .update(codeToRow({ name: updated.name, language: updated.language }))
    .eq('id', id)
    .select()
    .maybeSingle();
  return data ? codeFromRow(data) : null;
}

export async function deleteCodeFile(userId: number, id: number): Promise<void> {
  await sb.from('code_files').delete().eq('id', id).eq('user_id', userId);
}

/* =================== الإعدادات =================== */

const LEVELS_KEY = 'levels';
const SESSION_EPOCH_KEY = 'session_epoch';

/**
 * اللحظة التي يُعتبر أي توكن صُدِر قبلها باطلاً (مسح كل جلسات تسجيل الدخول).
 * 0 = غير مفعّل.
 */
export async function getSessionEpoch(): Promise<number> {
  try {
    const { data } = await sb.from('app_config').select('value').eq('key', SESSION_EPOCH_KEY).maybeSingle();
    const v = (data?.value as any) ?? 0;
    return typeof v === 'number' ? v : Number(v) || 0;
  } catch (e) {
    console.error('[db] getSessionEpoch:', (e as Error).message);
    return 0;
  }
}

export async function getLevels(): Promise<{ tiers: LevelTier[] }> {
  const { data } = await sb.from('app_config').select('value').eq('key', LEVELS_KEY).maybeSingle();
  const tiers = (data?.value as any)?.tiers;
  return { tiers: Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_LEVELS };
}

export async function setLevels(tiers: LevelTier[]): Promise<{ tiers: LevelTier[] }> {
  const clean = tiers
    .map((t) => ({
      min: Number(t.min) || 0,
      key: String(t.key || 'level'),
      name: String(t.name || ''),
      nameEn: String(t.nameEn || ''),
    }))
    .sort((a, b) => a.min - b.min);
  await sb.from('app_config').upsert({ key: LEVELS_KEY, value: { tiers: clean } }, { onConflict: 'key' });
  return { tiers: clean };
}

/* =================== إحصائيات الطالب =================== */

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

export async function computeStudentStats(userId: number): Promise<StudentStats> {
  const user = await findUserById(userId);
  const studentGrade = user?.grade;

  const results = await listResultsByUser(userId);
  const scores = results.map((r) => Number(r.best ?? r.score ?? 0)).filter((s) => !Number.isNaN(s));
  const examAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const allExams = await listExams();
  const totalExams = allExams.filter(({ grade }) => gradeAllowed(grade, studentGrade)).length;

  const lessons = (await listAllLessons()).filter(({ grade }) => gradeAllowed(grade, studentGrade));
  const progresses = await listProgressByUser(userId);
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

  const { tiers } = await getLevels();
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

/* =================== تصحيح الامتحان =================== */

export interface SubmitOutcome {
  score: number;
  best: number;
  correct: number;
  total: number;
  passed: boolean;
  review: { id: number; text: string; textEn: string; given?: number; correctIndex: number; isCorrect: boolean }[];
}

export async function submitExam(userId: number, exam: Exam, answers: Record<string, number>): Promise<SubmitOutcome> {
  const questions = await listQuestionsByExam(exam.id);

  let correct = 0;
  const review = questions.map((q) => {
    const given = answers[String(q.id)];
    const isCorrect = given === q.correctIndex;
    if (isCorrect) correct++;
    return {
      id: q.id,
      text: q.text,
      textEn: q.textEn,
      given,
      correctIndex: q.correctIndex,
      isCorrect,
    };
  });

  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;

  const existing = await getResult(userId, exam.id);
  const prev = existing ?? { userId, examId: exam.id, best: 0, score: 0, correct: 0, total: 0, attempts: 0, answers: {}, history: [], at: 0 };
  const best = Math.max(prev.best ?? 0, score);
  const result: ExamResult = {
    ...prev,
    userId,
    examId: exam.id,
    score,
    best,
    correct,
    total: questions.length,
    answers,
    attempts: (prev.attempts ?? 0) + 1,
    history: [...(prev.history ?? []).slice(-19), { at: now(), score, correct, total: questions.length }],
    at: now(),
  };
  await upsertResult(result);

  return {
    score,
    best,
    correct,
    total: questions.length,
    passed: score >= (exam.passingScore ?? 50),
    review,
  };
}

/* =================== إحصائيات الأدمن =================== */

export async function adminStats(): Promise<{
  students: number;
  admins: number;
  courses: number;
  lessons: number;
  exams: number;
  notes: number;
  codeFiles: number;
}> {
  const [users, courses, lessons, exams, notes] = await Promise.all([
    listAllUsers(),
    listCourses(),
    listAllLessons(),
    listExams(),
    listNotes(),
  ]);
  const { count } = await sb.from('code_files').select('id', { count: 'exact', head: true });
  return {
    students: users.filter((u) => u.role === 'student').length,
    admins: users.filter((u) => u.role === 'admin').length,
    courses: courses.length,
    lessons: lessons.length,
    exams: exams.length,
    notes: notes.length,
    codeFiles: count ?? 0,
  };
}

/* =================== النسخ الاحتياطي والتنظيف =================== */

export const BACKUP_TABLES = [
  'users',
  'courses',
  'lessons',
  'exams',
  'questions',
  'notes',
  'top_students',
  'progress',
  'exam_results',
  'code_files',
  'app_config',
] as const;

export async function exportAllToBackup(bucket: string): Promise<{ url: string; size: number; fileName: string }> {
  const { data: existing } = await sb.storage.getBucket(bucket);
  if (!existing) {
    const { error: bucketError } = await sb.storage.createBucket(bucket, { public: true });
    if (bucketError) throw new Error(`فشل إنشاء bucket النسخ الاحتياطي: ${bucketError.message}`);
  }

  const snapshot: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    tables: {} as Record<string, any>,
  };

  for (const table of BACKUP_TABLES) {
    const { data } = await sb.from(table).select('*');
    snapshot.tables[table] = data ?? [];
  }

  const json = JSON.stringify(snapshot, null, 2);
  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const { error } = await sb.storage
    .from(bucket)
    .upload(fileName, new TextEncoder().encode(json), { contentType: 'application/json', upsert: false });
  if (error) throw new Error(`فشل رفع النسخة الاحتياطية: ${error.message}`);

  const { data } = sb.storage.from(bucket).getPublicUrl(fileName);
  return { url: data.publicUrl, size: json.length, fileName };
}

export async function cleanupData(): Promise<{ trimmedFiles: number; trimmedResults: number }> {
  let trimmedFiles = 0;
  let trimmedResults = 0;

  const { data: files } = await sb.from('code_files').select('*');
  for (const f of files ?? []) {
    const versions = Array.isArray(f.versions) ? f.versions : [];
    if (versions.length > MAX_VERSIONS) {
      await sb.from('code_files').update({ versions: versions.slice(-MAX_VERSIONS) }).eq('id', f.id);
      trimmedFiles++;
    }
  }

  const { data: results } = await sb.from('exam_results').select('*');
  for (const r of results ?? []) {
    const history = Array.isArray(r.history) ? r.history : [];
    if (history.length > MAX_HISTORY) {
      await sb.from('exam_results').update({ history: history.slice(-MAX_HISTORY) }).eq('user_id', r.user_id).eq('exam_id', r.exam_id);
      trimmedResults++;
    }
  }

  return { trimmedFiles, trimmedResults };
}
