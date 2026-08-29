import { sb } from './supabase.ts';
import { tierByPoints, DEFAULT_LEVELS, type LevelTier } from './levels.ts';
import { GRADES, gradeAllowed } from './access.ts';

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

/** جلب سريع لأعمدة المصادقة فقط (يُستخدم في الـ middleware لكل طلب بدلاً من جلب كل الصف). */
export async function findAuthUserById(id: number): Promise<DbUser | null> {
  const { data } = await sb
    .from('users')
    .select('id, role, full_name, username, phone, grade, blocked, subscription')
    .eq('id', id)
    .maybeSingle();
  return data ? userFromRow(data) : null;
}

/** صيغ محتملة لنفس الرقم في القاعدة (تُستخدم مع فهرس phone الفريد بدلاً من مسح الجدول). */
function phoneCandidates(norm: string): string[] {
  const c = new Set<string>();
  c.add(norm);
  if (norm.length === 11 && norm.startsWith('0')) {
    const ten = norm.slice(1); // 1xxxxxxxxxx
    c.add(ten);
    c.add('+20' + ten);
    c.add('20' + ten);
    c.add('0020' + ten);
    c.add('00' + ten);
  } else if (norm.length === 10) {
    c.add('0' + norm);
  }
  return [...c];
}

export async function findUserByPhone(normPhone: string): Promise<DbUser | null> {
  const target = normalizePhone(normPhone);
  if (!target) return null;
  const candidates = phoneCandidates(target);
  let query = sb.from('users').select('*');
  query = candidates.length === 1 ? query.eq('phone', candidates[0]) : query.in('phone', candidates);
  const { data } = await query.limit(20);
  const rows = data ?? [];
  const found = rows.find((r) => normalizePhone(String(r.phone ?? '')) === target);
  return found ? userFromRow(found) : null;
}

/** بحث بالتليفون (بعد التوحيد/بالفهرس) أو باسم المستخدم (username). */
export async function findUserByIdentifier(identifier: string): Promise<DbUser | null> {
  const raw = String(identifier).trim();
  const norm = normalizePhone(raw);
  if (norm) {
    const byPhone = await findUserByPhone(norm);
    if (byPhone) return byPhone;
  }
  if (raw) {
    const { data } = await sb.from('users').select('*').eq('username', raw).maybeSingle();
    if (data) return userFromRow(data);
  }
  return null;
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

export async function listUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  grade?: string;
  subscription?: boolean;
  blocked?: boolean;
} = {}): Promise<{ users: SafeUser[]; total: number; page: number; limit: number; counts: { all: number; subscribed: number; unsubscribed: number; blocked: number } }> {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
  const search = params.search?.trim() ?? '';

  let query = sb.from('users').select('*', { count: 'exact' });
  if (search) {
    const safe = search.replace(/[(),*.]/g, '');
    const like = `%${safe}%`;
    query = query.or(`full_name.ilike.${like},phone.ilike.${like},username.ilike.${like}`) as any;
  }
  if (params.role) query = query.eq('role', params.role);
  if (params.grade) query = query.eq('grade', params.grade);
  if (params.subscription !== undefined) query = query.eq('subscription', params.subscription);
  if (params.blocked !== undefined) query = query.eq('blocked', params.blocked);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, count } = await query.order('id', { ascending: true }).range(from, to);

  const [countAll, subscribedCount, unsubscribedCount, blockedCount] = await Promise.all([
    countUsersFiltered({ search, grade: params.grade }),
    countUsersFiltered({ search, grade: params.grade, role: 'student', subscription: true }),
    countUsersFiltered({ search, grade: params.grade, role: 'student', subscription: false }),
    countUsersFiltered({ search, grade: params.grade, blocked: true }),
  ]);

  return {
    users: (data ?? []).map((r) => safeUser(userFromRow(r))),
    total: count ?? 0,
    page,
    limit,
    counts: { all: countAll, subscribed: subscribedCount, unsubscribed: unsubscribedCount, blocked: blockedCount },
  };
}

async function countUsersFiltered(opts: { search?: string; grade?: string; role?: string; subscription?: boolean; blocked?: boolean }): Promise<number> {
  const search = opts.search?.trim() ?? '';
  let q = sb.from('users').select('id', { count: 'exact', head: true });
  if (search) {
    const safe = search.replace(/[(),*.]/g, '');
    const like = `%${safe}%`;
    q = q.or(`full_name.ilike.${like},phone.ilike.${like},username.ilike.${like}`) as any;
  }
  if (opts.role) q = q.eq('role', opts.role);
  if (opts.grade) q = q.eq('grade', opts.grade);
  if (opts.subscription !== undefined) q = q.eq('subscription', opts.subscription);
  if (opts.blocked !== undefined) q = q.eq('blocked', opts.blocked);
  const { count } = await q;
  return count ?? 0;
}

export async function listAllUsers(): Promise<DbUser[]> {
  const { data } = await sb.from('users').select('*').order('id', { ascending: true });
  return (data ?? []).map(userFromRow);
}

/** حذف حساب طالب نهائياً مع كل بياناته المرتبطة (التقدم، نتائج الامتحانات، ملفات الكود). */
export async function deleteUser(id: number): Promise<void> {
  const results = await Promise.all([
    sb.from('progress').delete().eq('user_id', id),
    sb.from('exam_results').delete().eq('user_id', id),
    sb.from('code_files').delete().eq('user_id', id),
  ]);
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw new Error(`فشل حذف بيانات الطالب: ${firstError.message}`);

  const { data, error } = await sb.from('users').delete().eq('id', id).select('id');
  if (error) throw new Error(`فشل حذف حساب الطالب: ${error.message}`);
  if (!data || data.length === 0) throw new Error('الطالب غير موجود للحذف');
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

export async function listCoursesByGrade(grade: string): Promise<Course[]> {
  const { data } = await sb.from('courses')
    .select('*')
    .or(`grade.is.null,grade.eq.all,grade.eq.${grade}`)
    .order('order', { ascending: true });
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

export async function listLessonsByGrade(grade: string): Promise<Lesson[]> {
  const { data } = await sb.from('lessons')
    .select('*')
    .or(`grade.is.null,grade.eq.all,grade.eq.${grade}`)
    .order('order', { ascending: true });
  return (data ?? []).map(lessonFromRow);
}

export async function listLessonsByCourse(courseId: number): Promise<Lesson[]> {
  const { data } = await sb.from('lessons').select('*').eq('course_id', courseId).order('order', { ascending: true });
  return (data ?? []).map(lessonFromRow);
}

export async function listLessonsByCourseAndGrade(courseId: number, grade: string): Promise<Lesson[]> {
  const { data } = await sb.from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .or(`grade.is.null,grade.eq.all,grade.eq.${grade}`)
    .order('order', { ascending: true });
  return (data ?? []).map(lessonFromRow);
}

export async function listLessonStats(): Promise<{ courseId: number; count: number; duration: number }[]> {
  const { data } = await sb.from('lessons').select('course_id, duration');
  const map = new Map<number, { count: number; duration: number }>();
  for (const r of data ?? []) {
    const cid = Number(r.course_id);
    const d = Number(r.duration) || 0;
    const existing = map.get(cid) ?? { count: 0, duration: 0 };
    existing.count++;
    existing.duration += d;
    map.set(cid, existing);
  }
  return [...map.entries()].map(([courseId, v]) => ({ courseId, ...v }));
}

export async function listLessonStatsForGrade(grade?: string): Promise<{ count: number; duration: number }> {
  let query = sb.from('lessons').select('duration, grade');
  if (grade && grade !== 'all') {
    query = query.or(`grade.eq.all,grade.eq.${grade}`);
  }
  const { data } = await query;
  let count = 0;
  let duration = 0;
  for (const r of data ?? []) {
    count++;
    duration += Number(r.duration) || 0;
  }
  return { count, duration };
}

export async function countLessonsByGrade(grade?: string): Promise<number> {
  let query = sb.from('lessons').select('id', { count: 'exact', head: true });
  if (grade && grade !== 'all') {
    query = query.or(`grade.eq.all,grade.eq.${grade}`);
  }
  const { count } = await query;
  return count ?? 0;
}

export async function listLessonIdsAndDurations(grade?: string): Promise<{ id: number; duration: number; grade: string }[]> {
  let query = sb.from('lessons').select('id, duration, grade');
  if (grade && grade !== 'all') {
    query = query.or(`grade.eq.all,grade.eq.${grade}`);
  }
  const { data } = await query;
  return (data ?? []).map((r) => ({ id: Number(r.id), duration: Number(r.duration) || 0, grade: String(r.grade ?? 'all') }));
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

export async function listExamsByGrade(grade: string): Promise<Exam[]> {
  const { data } = await sb.from('exams')
    .select('*')
    .or(`grade.is.null,grade.eq.all,grade.eq.${grade}`)
    .order('order', { ascending: true });
  return (data ?? []).map(examFromRow);
}

export async function countExamsByCourse(courseId: number): Promise<number> {
  const { count } = await sb.from('exams').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  return count ?? 0;
}

export async function countExamsByGrade(grade?: string): Promise<number> {
  let query = sb.from('exams').select('id', { count: 'exact', head: true });
  if (grade && grade !== 'all') {
    query = query.or(`grade.eq.all,grade.eq.${grade}`);
  }
  const { count } = await query;
  return count ?? 0;
}

export async function listExamsWithQuestionCounts(): Promise<(Exam & { questionsCount: number })[]> {
  const exams = await listExams();
  const { data: allQuestions } = await sb.from('questions').select('exam_id');
  const qByExam = new Map<number, number>();
  for (const q of allQuestions ?? []) {
    const ex = Number(q.exam_id);
    qByExam.set(ex, (qByExam.get(ex) ?? 0) + 1);
  }
  return exams.map((e) => ({ ...e, questionsCount: qByExam.get(e.id) ?? 0 }));
}

export async function listExamsByGradeWithQuestionCounts(grade: string): Promise<(Exam & { questionsCount: number })[]> {
  const exams = await listExamsByGrade(grade);
  const { data: allQuestions } = await sb.from('questions').select('exam_id');
  const qByExam = new Map<number, number>();
  for (const q of allQuestions ?? []) {
    const ex = Number(q.exam_id);
    qByExam.set(ex, (qByExam.get(ex) ?? 0) + 1);
  }
  return exams.map((e) => ({ ...e, questionsCount: qByExam.get(e.id) ?? 0 }));
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
  explanation: string;
  explanationEn: string;
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
    explanation: r.explanation ?? '',
    explanationEn: r.explanation_en ?? '',
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
  if (q.explanation !== undefined) row.explanation = q.explanation;
  if (q.explanationEn !== undefined) row.explanation_en = q.explanationEn;
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

export async function listNotesByGrade(grade: string): Promise<Note[]> {
  const { data } = await sb.from('notes')
    .select('*')
    .or(`grade.is.null,grade.eq.all,grade.eq.${grade}`)
    .order('order', { ascending: true });
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

/** خلاصة النتائج فقط (بلا الإجابات/السجل) — تكفي لصفحات المستخدم والمستوى. */
export async function listResultSummariesByUser(userId: number): Promise<{ examId: number; best: number; score: number; correct: number; total: number; attempts: number }[]> {
  const { data } = await sb
    .from('exam_results')
    .select('exam_id, best, score, correct, total, attempts')
    .eq('user_id', userId);
  return (data ?? []).map((r: any) => ({
    examId: Number(r.exam_id),
    best: Number(r.best) || 0,
    score: Number(r.score) || 0,
    correct: Number(r.correct) || 0,
    total: Number(r.total) || 0,
    attempts: Number(r.attempts) || 0,
  }));
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
  const { data } = await sb
    .from('code_files')
    .select('id, user_id, name, language, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
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

const SESSION_EPOCH_CACHE_TTL = 60_000;
let sessionEpochCache: { at: number; value: number } | null = null;

/** إبطال كاش الـ epoch فوراً بعد تغييرها من لوحة الأدمن. */
export function invalidateSessionEpoch(): void {
  sessionEpochCache = null;
}

/**
 * اللحظة التي يُعتبر أي توكن صُدِر قبلها باطلاً (مسح كل جلسات تسجيل الدخول).
 * تُخزَّن مؤقتاً 60 ثانية لتخفيف استعلام لكل طلب مصادقة.
 */
export async function getSessionEpoch(): Promise<number> {
  if (sessionEpochCache && Date.now() - sessionEpochCache.at < SESSION_EPOCH_CACHE_TTL) {
    return sessionEpochCache.value;
  }
  try {
    const { data } = await sb.from('app_config').select('value').eq('key', SESSION_EPOCH_KEY).maybeSingle();
    const v = (data?.value as any) ?? 0;
    const value = typeof v === 'number' ? v : Number(v) || 0;
    sessionEpochCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('[db] getSessionEpoch:', (e as Error).message);
    return 0;
  }
}

const LEVELS_CACHE_TTL = 60_000;
let levelsCache: { at: number; tiers: LevelTier[] } | null = null;

export async function getLevels(): Promise<{ tiers: LevelTier[] }> {
  if (levelsCache && Date.now() - levelsCache.at < LEVELS_CACHE_TTL) {
    return { tiers: levelsCache.tiers };
  }
  const { data } = await sb.from('app_config').select('value').eq('key', LEVELS_KEY).maybeSingle();
  const tiers = (data?.value as any)?.tiers;
  const clean = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_LEVELS;
  levelsCache = { at: Date.now(), tiers: clean };
  return { tiers: clean };
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
  levelsCache = null;
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

  const [results, progresses, lessonIds, totalExams, { tiers }] = await Promise.all([
    listResultsByUser(userId),
    listProgressByUser(userId),
    listLessonIdsAndDurations(studentGrade),
    countExamsByGrade(studentGrade),
    getLevels(),
  ]);

  const scores = results.map((r) => Number(r.best ?? r.score ?? 0)).filter((s) => !Number.isNaN(s));
  const examAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

  let totalDuration = 0;
  let totalWatched = 0;
  let completed = 0;
  for (const lesson of lessonIds) {
    totalDuration += lesson.duration;
    const w = Math.min(watchByLesson.get(lesson.id) ?? 0, lesson.duration);
    totalWatched += w;
    if (lesson.duration > 0 && w >= lesson.duration * 0.9) completed++;
  }

  const watchRatio = totalDuration > 0 ? totalWatched / totalDuration : 0;
  const points = Math.min(100, Math.max(0, Math.round(examAvg * 0.6 + watchRatio * 100 * 0.4)));
  const level = tierByPoints(points, tiers);

  return {
    examAvg: Math.round(examAvg),
    watchRatio,
    points,
    level,
    completedLessons: completed,
    totalLessons: lessonIds.length,
    examsTaken: scores.length,
    totalExams,
  };
}

/**
 * نسخة مجمّعة من computeStudentStats لعدة طلاب معاً (لوحة الأدمن):
 * تستبدل N×5 استعلامات متتابعة بـ ~5 استعلامات إجمالاً، بنفس النتائج تماماً.
 */
export async function computeStudentStatsBatch(userIds: number[]): Promise<Map<number, StudentStats>> {
  const ids = [...new Set(userIds.filter((x) => Number.isFinite(x) && x > 0))];
  const out = new Map<number, StudentStats>();
  if (ids.length === 0) return out;

  const [userRows, allExams, allLessons, progressRows, resultRows, { tiers }] = await Promise.all([
    sb.from('users').select('id,grade').in('id', ids),
    listExams(),
    listAllLessons(),
    sb.from('progress').select('*').in('user_id', ids),
    sb.from('exam_results').select('*').in('user_id', ids),
    getLevels(),
  ]);

  // مجاميع تُحسب مرة واحدة لكل مرحلة بدلاً من التكرار على كل الدروس/الامتحانات لكل طالب
  const lessonById = new Map<number, Lesson>();
  let baseLessonCount = 0;
  let baseDuration = 0;
  let baseExams = 0;
  const gradeLessonCount = new Map<string, number>();
  const gradeDuration = new Map<string, number>();
  const gradeExams = new Map<string, number>();
  for (const g of Object.keys(GRADES)) {
    gradeLessonCount.set(g, 0);
    gradeDuration.set(g, 0);
    gradeExams.set(g, 0);
  }
  for (const l of allLessons) {
    lessonById.set(l.id, l);
    const d = Number(l.duration) || 0;
    if (!l.grade || l.grade === 'all') {
      baseLessonCount++;
      baseDuration += d;
    } else if (gradeLessonCount.has(l.grade)) {
      gradeLessonCount.set(l.grade, (gradeLessonCount.get(l.grade) ?? 0) + 1);
      gradeDuration.set(l.grade, (gradeDuration.get(l.grade) ?? 0) + d);
    }
  }
  for (const e of allExams) {
    if (!e.grade || e.grade === 'all') baseExams++;
    else if (gradeExams.has(e.grade)) gradeExams.set(e.grade, (gradeExams.get(e.grade) ?? 0) + 1);
  }

  const progressByUser = new Map<number, Progress[]>();
  for (const p of (progressRows.data ?? []).map(progressFromRow)) {
    const arr = progressByUser.get(p.userId) ?? [];
    arr.push(p);
    progressByUser.set(p.userId, arr);
  }

  const resultsByUser = new Map<number, ExamResult[]>();
  for (const r of (resultRows.data ?? []).map(resultFromRow)) {
    const arr = resultsByUser.get(r.userId) ?? [];
    arr.push(r);
    resultsByUser.set(r.userId, arr);
  }

  for (const u of userRows.data ?? []) {
    const id = Number(u.id);
    const studentGrade = String(u.grade ?? '');
    const scores = (resultsByUser.get(id) ?? []).map((r) => Number(r.best ?? r.score ?? 0)).filter((s) => !Number.isNaN(s));
    const examAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const totalLessons = baseLessonCount + (gradeLessonCount.get(studentGrade) ?? 0);
    const totalDuration = baseDuration + (gradeDuration.get(studentGrade) ?? 0);
    const totalExams = baseExams + (gradeExams.get(studentGrade) ?? 0);

    let totalWatched = 0;
    let completed = 0;
    for (const p of progressByUser.get(id) ?? []) {
      const lesson = lessonById.get(p.lessonId);
      if (!lesson || !gradeAllowed(lesson.grade, studentGrade)) continue;
      const d = Number(lesson.duration) || 0;
      const w = Math.min(Number(p.secondsWatched) || 0, d);
      totalWatched += w;
      if (d > 0 && w >= d * 0.9) completed++;
    }

    const watchRatio = totalDuration > 0 ? totalWatched / totalDuration : 0;
    const points = Math.min(100, Math.max(0, Math.round(examAvg * 0.6 + watchRatio * 100 * 0.4)));

    out.set(id, {
      examAvg: Math.round(examAvg),
      watchRatio,
      points,
      level: tierByPoints(points, tiers),
      completedLessons: completed,
      totalLessons,
      examsTaken: scores.length,
      totalExams,
    });
  }

  return out;
}

/* =================== تصحيح الامتحان =================== */

export interface SubmitOutcome {
  score: number;
  best: number;
  correct: number;
  total: number;
  passed: boolean;
  review: { id: number; text: string; textEn: string; given?: number; correctIndex: number; isCorrect: boolean; explanation: string; explanationEn: string }[];
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
      explanation: q.explanation,
      explanationEn: q.explanationEn,
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
  subscribed: number;
  courses: number;
  lessons: number;
  exams: number;
  notes: number;
  codeFiles: number;
}> {
  const [studentsCount, adminsCount, subscribedCount, coursesCount, lessonsCount, examsCount, notesCount, codeFilesCount] = await Promise.all([
    sb.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    sb.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    sb.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('subscription', true),
    sb.from('courses').select('id', { count: 'exact', head: true }),
    sb.from('lessons').select('id', { count: 'exact', head: true }),
    sb.from('exams').select('id', { count: 'exact', head: true }),
    sb.from('notes').select('id', { count: 'exact', head: true }),
    sb.from('code_files').select('id', { count: 'exact', head: true }),
  ]);
  return {
    students: studentsCount.count ?? 0,
    admins: adminsCount.count ?? 0,
    subscribed: subscribedCount.count ?? 0,
    courses: coursesCount.count ?? 0,
    lessons: lessonsCount.count ?? 0,
    exams: examsCount.count ?? 0,
    notes: notesCount.count ?? 0,
    codeFiles: codeFilesCount.count ?? 0,
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
    const { error: bucketError } = await sb.storage.createBucket(bucket, { public: false });
    if (bucketError) throw new Error(`فشل إنشاء bucket النسخ الاحتياطي: ${bucketError.message}`);
  }

  const snapshot: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    tables: {} as Record<string, any>,
  };

  const tableQueries = BACKUP_TABLES.map((table) => {
    if (table === 'users') {
      return sb.from(table).select('id, full_name, phone, grade, role, subscription, blocked, created_at');
    }
    return sb.from(table).select('*');
  });

  const results = await Promise.all(tableQueries);
  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    snapshot.tables[BACKUP_TABLES[i]] = results[i].data ?? [];
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

  const { data: files } = await sb.from('code_files').select('id, versions').limit(200);
  const fileUpdates = (files ?? []).filter((f) => {
    const versions = Array.isArray(f.versions) ? f.versions : [];
    return versions.length > MAX_VERSIONS;
  });
  if (fileUpdates.length) {
    await Promise.all(
      fileUpdates.map((f) =>
        sb.from('code_files').update({ versions: (Array.isArray(f.versions) ? f.versions : []).slice(-MAX_VERSIONS) }).eq('id', f.id)
      )
    );
    trimmedFiles = fileUpdates.length;
  }

  const { data: results } = await sb.from('exam_results').select('user_id, exam_id, history').limit(200);
  const resultUpdates = (results ?? []).filter((r) => {
    const history = Array.isArray(r.history) ? r.history : [];
    return history.length > MAX_HISTORY;
  });
  if (resultUpdates.length) {
    await Promise.all(
      resultUpdates.map((r) =>
        sb.from('exam_results').update({ history: (Array.isArray(r.history) ? r.history : []).slice(-MAX_HISTORY) }).eq('user_id', r.user_id).eq('exam_id', r.exam_id)
      )
    );
    trimmedResults = resultUpdates.length;
  }

  return { trimmedFiles, trimmedResults };
}
