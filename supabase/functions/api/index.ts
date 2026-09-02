import { Hono, type Context } from 'npm:hono@^4.6.3';
import { cors } from 'npm:hono@^4.6.3/cors';
import { CORS_ORIGIN, BUCKET_VIDEOS, BUCKET_IMAGES, BUCKET_BACKUPS, ADMIN_PHONE } from '../_shared/env.ts';
import { sb } from '../_shared/supabase.ts';
import { requireAuth, requireAdmin, requireSubscriber, signToken, authCookieHeader, clearAuthCookieHeader, type AuthUser, invalidateUserCache } from '../_shared/auth.ts';
import { hashPassword, verifyPassword } from '../_shared/password.ts';
import { GRADES, isContentGrade, gradeAllowed, contentVisible } from '../_shared/access.ts';
import {
  computeStudentStats,
  computeStudentStatsBatch,
  countAdmins,
  findAuthUserById,
  findUserById,
  findUserByPhone,
  findUserByIdentifier,
  createUser,
  updateUser,
  deleteUser,
  safeUser,
  normalizePhone,
  listUsers,
  listAllUsers,
  listCourses,
  listCoursesByGrade,
  findCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  listAllLessons,
  listLessonsByCourse,
  listLessonsByCourseAndGrade,
  listLessonsByGrade,
  listLessonStats,
  findLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
  listExams,
  listExamsByGrade,
  listExamsWithQuestionCounts,
  listExamsByGradeWithQuestionCounts,
  countExamsByCourse,
  findExamById,
  createExam,
  updateExam,
  deleteExam,
  listQuestionsByExam,
  findQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  listNotes,
  listNotesByGrade,
  findNoteById,
  createNote,
  updateNote,
  deleteNote,
  listTopStudents,
  findTopStudentById,
  createTopStudent,
  updateTopStudent,
  deleteTopStudent,
  listProgressByUser,
  getResult,
  listResultsByUser,
  listResultSummariesByUser,
  listCodeFilesByUser,
  getCodeFileByUser,
  createCodeFile,
  updateCodeFile,
  patchCodeFile,
  deleteCodeFile,
  getLevels,
  setLevels,
  adminStats,
  submitExam,
  createPasswordReset,
  findActivePasswordResetByUser,
  listAllPasswordResets,
  updatePasswordResetStatus,
  type ResetStatus,
  listLatestExamTop,
  listExamResultsPage,
} from '../_shared/db.ts';
import { ipOf, loginBlocked, recordLoginFailure, clearLoginFailures, registerAllowed, recordRegister, genericRateLimit } from '../_shared/rateLimit.ts';

const CODE_LANGUAGES = ['javascript', 'python', 'html', 'css'];
const TOP_GRADES = ['bac1', 'bac2'];

const origins = CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

/**
 * يُعيد الأصل المُرسل فقط إذا كان ضمن CORS_ORIGIN؛ الطلبات التي تحمل Origin
 * ولا تظهر في القائمة (أو القائمة فارغة) تُرفض بأمان، بينما الطلبات بلا Origin
 * (خوادم/أدوات) لا تحتاج رأس CORS وتُترك بلا ACAO.
 */
function resolveOrigin(origin: string): string | null {
  if (!origin) return null;
  if (origins.length === 0) return null; // fail-closed بدون قائمة أصول مضبوطة
  return origins.includes(origin) ? origin : null;
}

type Variables = { user: AuthUser };
const app = new Hono<{ Variables: Variables }>();

app.use(
  '*',
  cors({
    origin: resolveOrigin,
    allowHeaders: ['Content-Type', 'Authorization', 'x-path', 'X-Client-Info', 'apikey', 'x-retry-count', 'traceparent', 'tracestate', 'baggage'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'Content-Range'],
    credentials: true,
    maxAge: 86400,
  })
);

app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: 'خطأ داخلي في الخادم' }, 500);
});

function bodyText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function getUser(c: Context<{ Variables: Variables }>): AuthUser {
  return c.get('user');
}

/* =================== الصحة =================== */

app.get('/health', async (c) => {
  try {
    const { error } = await sb.from('app_config').select('key').limit(1);
    if (error) throw error;
    return c.json({ ok: true, db: 'up' });
  } catch (e) {
    return c.json({ ok: false, db: 'down', error: (e as Error).message }, 503);
  }
});

/* =================== المصادقة =================== */

app.post('/auth/register', async (c) => {
  const clientIp = ipOf(c.req.raw);
  if (!registerAllowed(clientIp)) {
    return c.json({ error: 'طلبات التسجيل كثيرة من هذا الجهاز، حاول لاحقاً' }, 429);
  }
  const { fullName, phone, grade, password } = await c.req.json().catch(() => ({}));
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 3) {
    return c.json({ error: 'الاسم الكامل مطلوب (3 أحرف على الأقل)' }, 400);
  }
  if (!phone || !/^[0-9+\s-]{8,15}$/.test(String(phone))) {
    return c.json({ error: 'رقم التليفون غير صحيح' }, 400);
  }
  if (!grade || !GRADES[grade as string]) {
    return c.json({ error: 'الصف الدراسي غير صحيح' }, 400);
  }
  if (!password || String(password).length < 6) {
    return c.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
  }

  const normPhone = normalizePhone(String(phone));
  const existing = await findUserByPhone(normPhone);
  if (existing) {
    return c.json({ error: 'رقم التليفون مسجل بالفعل' }, 400);
  }

  const isAdminByPhone = !!ADMIN_PHONE && normalizePhone(ADMIN_PHONE) === normPhone;
  const passwordHash = await hashPassword(String(password));
  const role = isAdminByPhone ? ('admin' as const) : ('student' as const);
  const user = await createUser({
    fullName: fullName.trim(),
    phone: normPhone,
    grade,
    role,
    subscription: role === 'admin',
    blocked: false,
    passwordHash,
    createdAt: Date.now(),
  });

  recordRegister(clientIp);
  const token = await signToken({ id: user.id, role: user.role, fullName: user.fullName, phone: user.phone, grade: user.grade });
  return c.json({ token, user: safeUser(user) }, 200, { 'Set-Cookie': authCookieHeader(token) });
});

app.post('/auth/login', async (c) => {
  const clientIp = ipOf(c.req.raw);
  const { identifier, password } = await c.req.json().catch(() => ({}));
  if (!identifier || !password) return c.json({ error: 'التليفون وكلمة المرور مطلوبان' }, 400);
  const loginKey = String(identifier);

  if (loginBlocked(clientIp, loginKey)) {
    return c.json({ error: 'محاولات تسجيل دخول كثيرة، حاول بعد 15 دقيقة' }, 429);
  }

  const user = await findUserByIdentifier(loginKey);
  if (!user || !(await verifyPassword(String(password), user.passwordHash))) {
    recordLoginFailure(clientIp, loginKey);
    return c.json({ error: 'بيانات الدخول غير صحيحة' }, 401);
  }
  if (user.blocked) {
    return c.json({ error: 'تم حظر حسابك من قبل إدارة الموقع. تواصل مع الإدارة واتساب: 01068633486' }, 403);
  }

  clearLoginFailures(loginKey);
  const token = await signToken({ id: user.id, role: user.role, fullName: user.fullName, phone: user.phone, grade: user.grade });
  return c.json({ token, user: safeUser(user) }, 200, { 'Set-Cookie': authCookieHeader(token) });
});

app.get('/auth/me', requireAuth, async (c) => {
  const user = await findUserById(getUser(c).id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  const [levels, results] = await Promise.all([getLevels(), listResultSummariesByUser(user.id)]);
  const examResults = results.map((r) => ({
    examId: r.examId,
    best: r.best,
    score: r.score,
    correct: r.correct,
    total: r.total,
    attempts: r.attempts,
  }));
  return c.json({ user: safeUser(user), levels: levels.tiers, examResults });
});

app.post('/auth/logout', async (c) => {
  return c.json({ ok: true }, 200, { 'Set-Cookie': clearAuthCookieHeader() });
});

/* =================== طلب تغيير كلمة السر =================== */

/** الطالب يطلب تغيير كلمة السر برقم التليفون. */
app.post('/auth/forgot-password', async (c) => {
  const { phone } = await c.req.json().catch(() => ({}));
  if (!phone || typeof phone !== 'string') return c.json({ error: 'رقم التليفون مطلوب' }, 400);
  const normPhone = normalizePhone(phone);
  if (!normPhone) return c.json({ error: 'رقم التليفون غير صحيح' }, 400);

  const user = await findUserByPhone(normPhone);
  if (!user) return c.json({ error: 'رقم التليفون غير مسجل' }, 404);
  if (user.role === 'admin') return c.json({ error: 'لا يمكن تغيير كلمة سر حساب مدير بهذه الطريقة' }, 400);

  const reset = await createPasswordReset(user.id);
  return c.json({ ok: true, requestId: reset.id });
});

/** الطالب يتحقق من حالة طلبه (pending / approved). */
app.get('/auth/forgot-password/status', async (c) => {
  const phone = c.req.query('phone');
  if (!phone || typeof phone !== 'string') return c.json({ error: 'رقم التليفون مطلوب' }, 400);
  const normPhone = normalizePhone(phone);
  if (!normPhone) return c.json({ status: 'none' });

  const user = await findUserByPhone(normPhone);
  if (!user) return c.json({ status: 'none' });

  const reset = await findActivePasswordResetByUser(user.id);
  if (!reset) return c.json({ status: 'none' });
  return c.json({ status: reset.status });
});

/** الطالب يضع كلمة السر الجديدة بعد موافقة الإدارة. */
app.post('/auth/forgot-password/complete', async (c) => {
  const { phone, password } = await c.req.json().catch(() => ({}));
  if (!phone || typeof phone !== 'string') return c.json({ error: 'رقم التليفون مطلوب' }, 400);
  if (!password || String(password).length < 6) return c.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
  const normPhone = normalizePhone(phone);
  if (!normPhone) return c.json({ error: 'رقم التليفون غير صحيح' }, 400);

  const user = await findUserByPhone(normPhone);
  if (!user) return c.json({ error: 'رقم التليفون غير مسجل' }, 404);
  if (user.role === 'admin') return c.json({ error: 'لا يمكن تغيير كلمة سر حساب مدير بهذه الطريقة' }, 400);

  const reset = await findActivePasswordResetByUser(user.id);
  if (!reset) return c.json({ error: 'لا يوجد طلب نشط لتغيير كلمة السر' }, 400);
  if (reset.status === 'pending') return c.json({ error: 'الطلب لم يتم تفعيله من الإدارة بعد' }, 400);
  if (reset.status === 'completed') return c.json({ error: 'تم استخدام هذا الطلب بالفعل. سجّل الدخول بكلمة السر الجديدة' }, 400);

  const passwordHash = await hashPassword(String(password));
  await updateUser(user.id, { passwordHash });
  invalidateUserCache(user.id);
  await updatePasswordResetStatus(reset.id, 'completed');

  return c.json({ ok: true });
});

/* =================== المحتوى الكامل (bootstrap) =================== */

/**
 * يعيد كل المحتوى الثابت في طلب واحد (كورسات، دروس، امتحانات بعدد الأسئلة،
 * مذكرات، أوائل الطلبة، مستويات، مراحل) بعد الفلترة حسب دور/مرحلة المستخدم.
 * تُحفظ النتيجة مؤقتاً في المتصفح لتقليل استعلامات الباك اند بشكل كبير.
 */
app.get('/bootstrap', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  if (!genericRateLimit(`bootstrap:${reqUser.id}`, 5, 60_000)) {
    return c.json({ error: 'تم تجاوز الحد المسموح — انتظر دقيقة' }, 429);
  }
  const isAdmin = reqUser.role === 'admin';
  const [courses, lessons, exams, notes, topItems, levels] = await Promise.all([
    isAdmin ? listCourses() : listCoursesByGrade(reqUser.grade),
    isAdmin ? listAllLessons() : listLessonsByGrade(reqUser.grade),
    isAdmin ? listExams() : listExamsByGrade(reqUser.grade),
    isAdmin ? listNotes() : listNotesByGrade(reqUser.grade),
    listTopStudents(),
    getLevels(),
  ]);

  const { data: allQuestions } = await sb.from('questions').select('exam_id');
  const qByExam = new Map<number, number>();
  for (const q of allQuestions ?? []) {
    const ex = Number(q.exam_id);
    qByExam.set(ex, (qByExam.get(ex) ?? 0) + 1);
  }

  const students = topItems
    .filter((s) => TOP_GRADES.includes(s.grade))
    .sort((a, b) => (a.grade === b.grade ? (a.rank ?? 0) - (b.rank ?? 0) : 0))
    .map((s) => ({
      id: s.id,
      name: s.name,
      image: s.image ?? '',
      rank: Number(s.rank) || 0,
      grade: s.grade,
      gradeName: GRADES[s.grade]?.name ?? s.grade,
    }));

  return c.json({
    courses,
    lessons,
    exams: exams.map((e) => ({ ...e, questionsCount: qByExam.get(e.id) ?? 0 })),
    notes,
    topStudents: students,
    levels: levels.tiers,
    grades: GRADES,
  });
});

/* =================== الكورسات والدروس =================== */

app.get('/courses', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const isAdmin = reqUser.role === 'admin';
  const [courses, lessonStats] = await Promise.all([
    isAdmin ? listCourses() : listCoursesByGrade(reqUser.grade),
    listLessonStats(),
  ]);
  const statsMap = new Map(lessonStats.map((s) => [s.courseId, s]));

  const out = courses.map((course) => {
    const stats = statsMap.get(course.id) ?? { count: 0, duration: 0 };
    return {
      ...course,
      lessonCount: stats.count,
      completedLessons: 0,
      duration: stats.duration,
      watchedSeconds: 0,
      progress: 0,
    };
  });

  return c.json({ courses: out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
});

app.get('/courses/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const id = Number(c.req.param('id'));
  const course = await findCourseById(id);
  if (!course) return c.json({ error: 'الكورس غير موجود' }, 404);
  if (reqUser.role === 'student' && !gradeAllowed(course.grade, reqUser.grade)) {
    return c.json({ error: 'الكورس غير موجود' }, 404);
  }

  const isAdmin = reqUser.role === 'admin';
  const [lessons, examsCount] = await Promise.all([
    isAdmin ? listLessonsByCourse(id) : listLessonsByCourseAndGrade(id, reqUser.grade),
    countExamsByCourse(id),
  ]);

  const lessonList = lessons
    .map((l) => ({ ...l, watchedSeconds: 0, completed: false, progressPct: 0 }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return c.json({ course, lessons: lessonList, examsCount });
});

app.get('/lesson/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const id = Number(c.req.param('id'));
  const lesson = await findLessonById(id);
  if (!lesson) return c.json({ error: 'الدرس غير موجود' }, 404);

  const course = await findCourseById(lesson.courseId);
  const lessonGrade = lesson.grade ?? course?.grade;
  if (reqUser.role === 'student' && !gradeAllowed(lessonGrade, reqUser.grade)) {
    return c.json({ error: 'الدرس غير موجود' }, 404);
  }

  const lessons = await listLessonsByCourse(lesson.courseId);
  const filtered = lessons.filter(
    (l) => contentVisible(reqUser.role, l.grade ?? course?.grade, reqUser.grade)
  );

  const out = {
    ...lesson,
    watchedSeconds: 0,
    completed: false,
    progressPct: 0,
  };

  return c.json({
    lesson: out,
    lessons: filtered.map((l) => ({ id: l.id, title: l.title, titleEn: l.titleEn })),
  });
});

app.post('/courses', requireAuth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!bodyText(b.title)) return c.json({ error: 'اسم الكورس مطلوب' }, 400);
  const course = await createCourse({
    title: bodyText(b.title),
    titleEn: bodyText(b.titleEn),
    description: bodyText(b.description),
    descriptionEn: bodyText(b.descriptionEn),
    image: bodyText(b.image),
    grade: isContentGrade(b.grade) ? b.grade : 'all',
    order: Number(b.order) || 0,
    createdAt: Date.now(),
  });
  return c.json({ course });
});

app.put('/courses/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const course = await findCourseById(id);
  if (!course) return c.json({ error: 'الكورس غير موجود' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const updated = await updateCourse(id, {
    title: b.title !== undefined ? bodyText(b.title) : course.title,
    titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : course.titleEn,
    description: b.description !== undefined ? bodyText(b.description) : course.description,
    descriptionEn: b.descriptionEn !== undefined ? bodyText(b.descriptionEn) : course.descriptionEn,
    image: b.image !== undefined ? bodyText(b.image) : course.image,
    grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : course.grade) : course.grade,
    order: b.order !== undefined ? Number(b.order) : course.order,
  });
  return c.json({ course: updated });
});

app.delete('/courses/:id', requireAuth, requireAdmin, async (c) => {
  await deleteCourse(Number(c.req.param('id')));
  return c.json({ ok: true });
});

app.post('/lessons', requireAuth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.courseId || !bodyText(b.title)) return c.json({ error: 'معرّف الكورس واسم الدرس مطلوبان' }, 400);
  if (!['youtube', 'upload'].includes(b.videoType) || !bodyText(b.videoUrl)) {
    return c.json({ error: 'نوع الفيديو ورابطه مطلوبان' }, 400);
  }
  const lesson = await createLesson({
    courseId: Number(b.courseId),
    title: bodyText(b.title),
    titleEn: bodyText(b.titleEn),
    videoType: b.videoType,
    videoUrl: bodyText(b.videoUrl),
    duration: Math.max(0, Number(b.duration) || 0),
    description: bodyText(b.description),
    descriptionEn: bodyText(b.descriptionEn),
    grade: isContentGrade(b.grade) ? b.grade : 'all',
    order: Number(b.order) || 0,
    createdAt: Date.now(),
  });
  return c.json({ lesson });
});

app.put('/lessons/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const lesson = await findLessonById(id);
  if (!lesson) return c.json({ error: 'الدرس غير موجود' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const updated = await updateLesson(id, {
    courseId: b.courseId !== undefined ? Number(b.courseId) : lesson.courseId,
    title: b.title !== undefined ? bodyText(b.title) : lesson.title,
    titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : lesson.titleEn,
    videoType: b.videoType !== undefined ? b.videoType : lesson.videoType,
    videoUrl: b.videoUrl !== undefined ? bodyText(b.videoUrl) : lesson.videoUrl,
    duration: b.duration !== undefined ? Math.max(0, Number(b.duration) || 0) : lesson.duration,
    description: b.description !== undefined ? bodyText(b.description) : lesson.description,
    descriptionEn: b.descriptionEn !== undefined ? bodyText(b.descriptionEn) : lesson.descriptionEn,
    grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : lesson.grade) : lesson.grade,
    order: b.order !== undefined ? Number(b.order) : lesson.order,
  });
  return c.json({ lesson: updated });
});

app.delete('/lessons/:id', requireAuth, requireAdmin, async (c) => {
  await deleteLesson(Number(c.req.param('id')));
  return c.json({ ok: true });
});

/* =================== الامتحانات =================== */

app.get('/exams', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const isAdmin = reqUser.role === 'admin';
  const examsWithCounts = isAdmin ? await listExamsWithQuestionCounts() : await listExamsByGradeWithQuestionCounts(reqUser.grade);
  const out = examsWithCounts
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return c.json({ exams: out });
});

app.get('/exams/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const id = Number(c.req.param('id'));
  const exam = await findExamById(id);
  if (!exam) return c.json({ error: 'الامتحان غير موجود' }, 404);
  if (reqUser.role === 'student' && !gradeAllowed(exam.grade, reqUser.grade)) {
    return c.json({ error: 'الامتحان غير موجود' }, 404);
  }
  const lastResult = await getResult(reqUser.id, id);
  const questions = (await listQuestionsByExam(id))
    .filter((q) => q.correctIndex >= 0)
    .map((q) => ({
    id: q.id,
    text: q.text,
    textEn: q.textEn,
    options: q.options,
    hasImage: !!q.image,
    image: q.image,
    explanation: q.explanation,
    explanationEn: q.explanationEn,
    order: q.order,
    // نكشف الإجابة الصحيحة فقط لمن أدّى الامتحان بالفعل (لا يُكشف قبل بدء الامتحان)
    correctIndex: lastResult ? q.correctIndex : undefined,
  }));
  return c.json({ exam, questions, lastResult });
});

app.post('/exams/:id/submit', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const id = Number(c.req.param('id'));
  const exam = await findExamById(id);
  if (!exam) return c.json({ error: 'الامتحان غير موجود' }, 404);
  if (reqUser.role === 'student' && !gradeAllowed(exam.grade, reqUser.grade)) {
    return c.json({ error: 'الامتحان غير موجود' }, 404);
  }

  const existing = await getResult(reqUser.id, id);
  if (existing && !exam.allowRetake) {
    return c.json({ error: 'لقد أديت هذا الامتحان بالفعل ولا يمكنك إعادته' }, 403);
  }

  const { answers } = await c.req.json().catch(() => ({}));
  const outcome = await submitExam(reqUser.id, exam, (answers as Record<string, number>) ?? {});
  clearLatestExamTopCache();
  return c.json({
    score: outcome.score,
    best: outcome.best,
    correct: outcome.correct,
    total: outcome.total,
    passed: outcome.passed,
    review: outcome.review,
  });
});

app.post('/exams', requireAuth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!bodyText(b.title)) return c.json({ error: 'اسم الامتحان مطلوب' }, 400);
  const exam = await createExam({
    courseId: b.courseId ? Number(b.courseId) : null,
    title: bodyText(b.title),
    titleEn: bodyText(b.titleEn),
    timeLimit: b.timeLimit ? Number(b.timeLimit) : null,
    passingScore: b.passingScore !== undefined ? Number(b.passingScore) : 50,
    grade: isContentGrade(b.grade) ? b.grade : 'all',
    allowRetake: !!b.allowRetake,
    order: Number(b.order) || 0,
    createdAt: Date.now(),
  });
  clearLatestExamTopCache();
  return c.json({ exam });
});

app.put('/exams/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const exam = await findExamById(id);
  if (!exam) return c.json({ error: 'الامتحان غير موجود' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const updated = await updateExam(id, {
    courseId: b.courseId !== undefined ? (b.courseId ? Number(b.courseId) : null) : exam.courseId,
    title: b.title !== undefined ? bodyText(b.title) : exam.title,
    titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : exam.titleEn,
    timeLimit: b.timeLimit !== undefined ? (b.timeLimit ? Number(b.timeLimit) : null) : exam.timeLimit,
    passingScore: b.passingScore !== undefined ? Number(b.passingScore) : exam.passingScore,
    grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : exam.grade) : exam.grade,
    allowRetake: b.allowRetake !== undefined ? !!b.allowRetake : exam.allowRetake,
    order: b.order !== undefined ? Number(b.order) : exam.order,
  });
  clearLatestExamTopCache();
  return c.json({ exam: updated });
});

app.delete('/exams/:id', requireAuth, requireAdmin, async (c) => {
  await deleteExam(Number(c.req.param('id')));
  clearLatestExamTopCache();
  return c.json({ ok: true });
});

app.post('/exams/:id/questions', requireAuth, requireAdmin, async (c) => {
  const examId = Number(c.req.param('id'));
  const b = await c.req.json().catch(() => ({}));
  if (!bodyText(b.text) || !Array.isArray(b.options) || b.options.length < 2 || b.correctIndex === undefined) {
    return c.json({ error: 'نص السؤال والخيارات والإجابة الصحيحة مطلوبة' }, 400);
  }
  if (b.correctIndex < 0 || b.correctIndex >= b.options.length) {
    return c.json({ error: 'الإجابة الصحيحة خارج نطاق الخيارات' }, 400);
  }
  const question = await createQuestion({
    examId,
    text: bodyText(b.text),
    textEn: bodyText(b.textEn),
    options: b.options.map((o: any) => ({ text: bodyText(o.text), textEn: bodyText(o.textEn) })),
    correctIndex: Number(b.correctIndex),
    image: bodyText(b.image),
    explanation: bodyText(b.explanation),
    explanationEn: bodyText(b.explanationEn),
    order: Number(b.order) || 0,
  });
  return c.json({ question });
});

app.put('/questions/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const q = await findQuestionById(id);
  if (!q) return c.json({ error: 'السؤال غير موجود' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const options = b.options !== undefined ? b.options.map((o: any) => ({ text: bodyText(o.text), textEn: bodyText(o.textEn) })) : q.options;
  if (b.correctIndex !== undefined) {
    const idx = Number(b.correctIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      return c.json({ error: 'الإجابة الصحيحة خارج نطاق الخيارات' }, 400);
    }
  }
  const updated = await updateQuestion(id, {
    text: b.text !== undefined ? bodyText(b.text) : q.text,
    textEn: b.textEn !== undefined ? bodyText(b.textEn) : q.textEn,
    options,
    correctIndex: b.correctIndex !== undefined ? Number(b.correctIndex) : q.correctIndex,
    image: b.image !== undefined ? bodyText(b.image) : q.image,
    explanation: b.explanation !== undefined ? bodyText(b.explanation) : q.explanation,
    explanationEn: b.explanationEn !== undefined ? bodyText(b.explanationEn) : q.explanationEn,
    order: b.order !== undefined ? Number(b.order) : q.order,
  });
  return c.json({ question: updated });
});

app.delete('/questions/:id', requireAuth, requireAdmin, async (c) => {
  await deleteQuestion(Number(c.req.param('id')));
  return c.json({ ok: true });
});

/* =================== المذكرات =================== */

app.get('/notes', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const isAdmin = reqUser.role === 'admin';
  const notes = (isAdmin ? await listNotes() : await listNotesByGrade(reqUser.grade))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return c.json({ notes });
});

app.get('/notes/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const note = await findNoteById(Number(c.req.param('id')));
  if (!note) return c.json({ error: 'المذكرة غير موجودة' }, 404);
  if (reqUser.role === 'student' && !gradeAllowed(note.grade, reqUser.grade)) {
    return c.json({ error: 'المذكرة غير موجودة' }, 404);
  }
  return c.json({ note });
});

app.post('/notes', requireAuth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!bodyText(b.title)) return c.json({ error: 'عنوان المذكرة مطلوب' }, 400);
  const note = await createNote({
    courseId: b.courseId ? Number(b.courseId) : null,
    title: bodyText(b.title),
    titleEn: bodyText(b.titleEn),
    body: bodyText(b.body),
    bodyEn: bodyText(b.bodyEn),
    image: bodyText(b.image),
    grade: isContentGrade(b.grade) ? b.grade : 'all',
    order: Number(b.order) || 0,
    createdAt: Date.now(),
  });
  return c.json({ note });
});

app.put('/notes/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const note = await findNoteById(id);
  if (!note) return c.json({ error: 'المذكرة غير موجودة' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const updated = await updateNote(id, {
    courseId: b.courseId !== undefined ? (b.courseId ? Number(b.courseId) : null) : note.courseId,
    title: b.title !== undefined ? bodyText(b.title) : note.title,
    titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : note.titleEn,
    body: b.body !== undefined ? bodyText(b.body) : note.body,
    bodyEn: b.bodyEn !== undefined ? bodyText(b.bodyEn) : note.bodyEn,
    image: b.image !== undefined ? bodyText(b.image) : note.image,
    grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : note.grade) : note.grade,
    order: b.order !== undefined ? Number(b.order) : note.order,
  });
  return c.json({ note: updated });
});

app.delete('/notes/:id', requireAuth, requireAdmin, async (c) => {
  await deleteNote(Number(c.req.param('id')));
  return c.json({ ok: true });
});

/* =================== ملفات الكود =================== */

app.get('/code', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const files = (await listCodeFilesByUser(reqUser.id)).map((f) => ({
    id: f.id,
    name: f.name,
    language: f.language,
    updatedAt: f.updatedAt,
    createdAt: f.createdAt,
  }));
  return c.json({ files });
});

app.post('/code', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const { name, language, code } = await c.req.json().catch(() => ({}));
  const fileName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'ملف جديد';
  const lang = CODE_LANGUAGES.includes(language) ? language : 'javascript';
  const file = await createCodeFile(reqUser.id, {
    name: fileName,
    language: lang,
    code: typeof code === 'string' ? code : '',
  });
  return c.json({ file });
});

app.get('/code/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const file = await getCodeFileByUser(reqUser.id, Number(c.req.param('id')));
  if (!file) return c.json({ error: 'الملف غير موجود' }, 404);
  return c.json({ file });
});

app.put('/code/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const id = Number(c.req.param('id'));
  const { code } = await c.req.json().catch(() => ({}));
  if (typeof code !== 'string') return c.json({ error: 'الكود مطلوب' }, 400);
  const file = await updateCodeFile(reqUser.id, id, code);
  if (!file) return c.json({ error: 'الملف غير موجود' }, 404);
  return c.json({ file });
});

app.patch('/code/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const id = Number(c.req.param('id'));
  const b = await c.req.json().catch(() => ({}));
  const file = await patchCodeFile(reqUser.id, id, {
    name: b.name !== undefined ? String(b.name).trim().slice(0, 60) : undefined,
    language: b.language !== undefined && CODE_LANGUAGES.includes(b.language) ? b.language : undefined,
  });
  if (!file) return c.json({ error: 'الملف غير موجود' }, 404);
  return c.json({ file });
});

app.delete('/code/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  await deleteCodeFile(reqUser.id, Number(c.req.param('id')));
  return c.json({ ok: true });
});

/* =================== أوائل الطلبة =================== */

app.get('/top-students', async (c) => {
  const items = await listTopStudents();
  const students = items
    .filter((s) => TOP_GRADES.includes(s.grade))
    .sort((a, b) => (a.grade === b.grade ? (a.rank ?? 0) - (b.rank ?? 0) : 0))
    .map((s) => ({
      id: s.id,
      name: s.name,
      image: s.image ?? '',
      rank: Number(s.rank) || 0,
      grade: s.grade,
      gradeName: GRADES[s.grade]?.name ?? s.grade,
    }));
  return c.json({ students });
});

/** أوائل ٣ من "الامتحان الأخير" لكل مرحلة (فرعي) — عام مثل /top-students، بكاش 60 ثانية. */
let latestExamTopCache: { at: number; data: unknown } | null = null;
const LATEST_EXAM_TOP_TTL = 60_000;

function clearLatestExamTopCache(): void {
  latestExamTopCache = null;
}

app.get('/latest-exam-top', async (c) => {
  const clientIp = ipOf(c.req.raw);
  if (!genericRateLimit(`latest-exam-top:${clientIp}`, 10, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  if (latestExamTopCache && Date.now() - latestExamTopCache.at < LATEST_EXAM_TOP_TTL) {
    return c.json(latestExamTopCache.data);
  }
  const data = { leaderboards: await listLatestExamTop() };
  latestExamTopCache = { at: Date.now(), data };
  return c.json(data);
});

/* =================== لوحة الأدمن =================== */

app.get('/admin/stats', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  if (!genericRateLimit(`admin-stats:${me.id}`, 3, 60_000)) {
    return c.json({ error: 'انتظر دقيقة بين كل طلب' }, 429);
  }
  return c.json({ stats: await adminStats() });
});

app.get('/admin/users', requireAuth, requireAdmin, async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const search = url.searchParams.get('search') ?? undefined;
  const filter = url.searchParams.get('filter') ?? 'all';
  const grade = url.searchParams.get('grade') ?? 'all';
  const { users, total, counts } = await listUsers({
    page,
    limit,
    search,
    role: filter === 'subscribed' || filter === 'unsubscribed' ? 'student' : undefined,
    grade: grade !== 'all' ? grade : undefined,
    subscription: filter === 'subscribed' ? true : filter === 'unsubscribed' ? false : undefined,
    blocked: filter === 'blocked' ? true : undefined,
  });
  const statsMap = await computeStudentStatsBatch(users.map((u) => u.id));
  const out = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    grade: u.grade,
    gradeName: GRADES[u.grade]?.name ?? u.grade,
    role: u.role,
    subscription: !!u.subscription,
    blocked: !!u.blocked,
    createdAt: u.createdAt,
    ...(statsMap.get(u.id) ?? {
      examAvg: 0,
      watchRatio: 0,
      points: 0,
      level: { min: 0, key: 'beginner', name: GRADES[u.grade]?.name ?? '', nameEn: '' },
      completedLessons: 0,
      totalLessons: 0,
      examsTaken: 0,
      totalExams: 0,
    }),
  }));
  return c.json({ users: out.sort((a, b) => b.points - a.points), total, page, limit, counts });
});

/** نسخة كاملة من كل المستخدمين مع إحصائياتهم في طلب واحد (بدون pagination أو استعلامات count) —
 *  تُستخدم في لوحة الطلبة حيث تتم الفلترة والبحث والترقيم في المتصفح لتخفيف الضغط على الباك اند. */
app.get('/admin/users/all', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  if (!genericRateLimit(`admin-users-all:${me.id}`, 1, 30_000)) {
    return c.json({ error: 'انتظر 30 ثانية بين كل طلب' }, 429);
  }
  const all = await listAllUsers();
  const statsMap = await computeStudentStatsBatch(all.map((u) => u.id));
  const out = all.map((u) => {
    const stats = statsMap.get(u.id);
    return {
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      grade: u.grade,
      gradeName: GRADES[u.grade]?.name ?? u.grade,
      role: u.role,
      subscription: !!u.subscription,
      blocked: !!u.blocked,
      createdAt: u.createdAt,
      examAvg: stats?.examAvg ?? 0,
      watchRatio: stats?.watchRatio ?? 0,
      points: stats?.points ?? 0,
      level: stats?.level ?? { min: 0, key: 'beginner', name: GRADES[u.grade]?.name ?? '', nameEn: '' },
      completedLessons: stats?.completedLessons ?? 0,
      totalLessons: stats?.totalLessons ?? 0,
      examsTaken: stats?.examsTaken ?? 0,
      totalExams: stats?.totalExams ?? 0,
      examScores: stats?.examScores ?? [],
    };
  }).sort((a, b) => b.points - a.points);
  return c.json({ users: out });
});

app.get('/admin/lessons', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  if (!genericRateLimit(`admin-lessons:${me.id}`, 3, 60_000)) {
    return c.json({ error: 'انتظر دقيقة بين كل طلب' }, 429);
  }
  const lessons = await listAllLessons();
  const courses = await listCourses();
  return c.json({ lessons, courses: courses.map((co) => ({ id: co.id, title: co.title, titleEn: co.titleEn, grade: co.grade })) });
});

app.get('/admin/users/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  const stats = await computeStudentStats(id);
  const safe = safeUser(user);
  const progress = await listProgressByUser(id);
  const results = await listResultsByUser(id);
  const codeFiles = (await listCodeFilesByUser(id)).map((f) => ({
    id: f.id,
    name: f.name,
    language: f.language,
    updatedAt: f.updatedAt,
  }));
  return c.json({
    user: { ...safe, gradeName: GRADES[safe.grade]?.name ?? safe.grade },
    stats,
    progress,
    results,
    codeFiles,
  });
});

app.get('/admin/exams/:id/questions', requireAuth, requireAdmin, async (c) => {
  const questions = await listQuestionsByExam(Number(c.req.param('id')));
  return c.json({ questions });
});

app.put('/admin/users/:id/role', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  const id = Number(c.req.param('id'));
  if (id === me.id) return c.json({ error: 'لا يمكنك تغيير دور حسابك الخاص' }, 400);
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  const { role } = await c.req.json().catch(() => ({}));
  if (!['student', 'admin'].includes(role)) return c.json({ error: 'دور غير صحيح' }, 400);
  if (user.role === 'admin' && role === 'student' && (await countAdmins()) <= 1) {
    return c.json({ error: 'لا يمكن تنزيل آخر مدير في النظام' }, 403);
  }
  const updated = await updateUser(id, { role });
  invalidateUserCache(id);
  return c.json({ user: safeUser(updated!) });
});

app.put('/admin/users/:id/subscription', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  const id = Number(c.req.param('id'));
  if (id === me.id) return c.json({ error: 'لا يمكنك تغيير اشتراك حسابك الخاص' }, 400);
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  const { subscription } = await c.req.json().catch(() => ({}));
  const updated = await updateUser(id, { subscription: !!subscription });
  invalidateUserCache(id);
  return c.json({ user: safeUser(updated!) });
});

app.put('/admin/users/:id/block', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  const id = Number(c.req.param('id'));
  if (id === me.id) return c.json({ error: 'لا يمكنك حظر حسابك الخاص' }, 400);
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  if (user.role === 'admin' && (await countAdmins()) <= 1) {
    return c.json({ error: 'لا يمكن حظر آخر مدير في النظام' }, 403);
  }
  const { blocked } = await c.req.json().catch(() => ({}));
  const updated = await updateUser(id, { blocked: !!blocked });
  invalidateUserCache(id);
  return c.json({ user: safeUser(updated!) });
});

app.delete('/admin/users/:id', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  const id = Number(c.req.param('id'));
  if (id === me.id) return c.json({ error: 'لا يمكنك حذف حسابك الخاص' }, 400);
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  if (user.role === 'admin') return c.json({ error: 'لا يمكن حذف حساب مدير' }, 403);
  await deleteUser(id);
  invalidateUserCache(id);
  clearLatestExamTopCache();
  return c.json({ ok: true });
});

app.get('/admin/config', requireAuth, requireAdmin, async (c) => {
  const levels = await getLevels();
  return c.json({ config: { levels, grades: GRADES } });
});

app.put('/admin/config/levels', requireAuth, requireAdmin, async (c) => {
  const { tiers } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return c.json({ error: 'المستويات غير صحيحة' }, 400);
  }
  const clean = await setLevels(tiers);
  return c.json({ config: { levels: clean } });
});

/* =================== طلبات تغيير كلمة السر (لوحة الأدمن) =================== */

/** قائمة جميع طلبات تغيير كلمة السر مع بيانات الطالب. */
app.get('/admin/password-resets', requireAuth, requireAdmin, async (c) => {
  const requests = await listAllPasswordResets();
  return c.json({ requests });
});

/** موافقة على طلب تغيير كلمة السر → يُعاد الكود مع بيانات الطالب لتمكين واتساب. */
app.post('/admin/password-resets/:id/approve', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'معرف غير صحيح' }, 400);
  const requests = await listAllPasswordResets();
  const req = requests.find((r) => r.id === id);
  if (!req) return c.json({ error: 'الطلب غير موجود' }, 404);
  if (req.status === 'completed') return c.json({ error: 'تم إتمام هذا الطلب بالفعل' }, 400);

  const updated = await updatePasswordResetStatus(id, 'approved');
  if (!updated) return c.json({ error: 'فشل تحديث الحالة' }, 500);

  const user = await findUserById(req.userId);
  return c.json({ ok: true, fullName: user?.fullName ?? req.fullName, phone: user?.phone ?? req.phone });
});

/** رفض طلب تغيير كلمة السر → يُرفض الطلب. */
app.post('/admin/password-resets/:id/reject', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'معرف غير صحيح' }, 400);
  const requests = await listAllPasswordResets();
  const req = requests.find((r) => r.id === id);
  if (!req) return c.json({ error: 'الطلب غير موجود' }, 404);
  if (req.status === 'completed') return c.json({ error: 'لا يمكن رفض طلب تم إتمامه' }, 400);

  await updatePasswordResetStatus(id, 'rejected');
  return c.json({ ok: true });
});

// رابط رفع مباشر إلى Storage (تجاوز حد الحجم في الدوال) — يوقّع URL ثم يرفع المتصفح مباشرة
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']);
const IMAGE_EXTS = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXTS = /\.(mp4|webm|mov|ogv|ogg)$/i;

app.post('/admin/upload-url', requireAuth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const bucketKey = b.bucket === 'images' ? 'images' : 'videos';
  const bucket = bucketKey === 'images' ? BUCKET_IMAGES : BUCKET_VIDEOS;
  const fileName = String(b.fileName ?? 'file');
  const contentType = String(b.contentType ?? 'application/octet-stream');

  const isImage = bucketKey === 'images';
  const typeOk = isImage ? ALLOWED_IMAGE_TYPES.has(contentType) : ALLOWED_VIDEO_TYPES.has(contentType);
  const extOk = isImage ? IMAGE_EXTS.test(fileName) : VIDEO_EXTS.test(fileName);
  if (!typeOk || !extOk) {
    return c.json(
      { error: isImage ? 'صيغة الصورة غير مسموحة (png/jpeg/webp/gif)' : 'صيغة الفيديو غير مسموحة (mp4/webm/mov/ogv)' },
      400
    );
  }

  await ensureBucket(bucket);
  const safePath = `${Date.now()}-${fileName.replace(/[^\w\u0600-\u06FF.-]+/g, '-').slice(0, 40)}`;
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(safePath, { upsert: true });
  if (error || !data) return c.json({ error: error?.message ?? 'فشل إنشاء رابط الرفع' }, 400);
  const { data: pub } = sb.storage.from(bucket).getPublicUrl(safePath);
  return c.json({ uploadUrl: data.signedUrl, path: safePath, publicUrl: pub.publicUrl, contentType });
});

// ===== إدارة أوائل الطلبة =====
app.get('/admin/top-students', requireAuth, requireAdmin, async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const items = await listTopStudents();
  const students = items.sort((a, b) => (a.grade === b.grade ? (a.rank ?? 0) - (b.rank ?? 0) : 0));
  const from = (page - 1) * limit;
  return c.json({ students: students.slice(from, from + limit), total: students.length, page, limit });
});

app.post('/admin/top-students', requireAuth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!bodyText(b.name)) return c.json({ error: 'اسم الطالب مطلوب' }, 400);
  if (!TOP_GRADES.includes(b.grade)) return c.json({ error: 'الصف الدراسي غير صحيح' }, 400);
  const student = await createTopStudent({
    name: bodyText(b.name),
    image: bodyText(b.image),
    rank: Math.max(1, Number(b.rank) || 1),
    grade: b.grade,
    createdAt: Date.now(),
  });
  return c.json({ student });
});

app.put('/admin/top-students/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const student = await findTopStudentById(id);
  if (!student) return c.json({ error: 'الطالب غير موجود' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const updated = await updateTopStudent(id, {
    name: b.name !== undefined ? bodyText(b.name) : student.name,
    image: b.image !== undefined ? bodyText(b.image) : student.image,
    rank: b.rank !== undefined ? Math.max(1, Number(b.rank) || 1) : student.rank,
    grade: b.grade !== undefined ? (TOP_GRADES.includes(b.grade) ? b.grade : student.grade) : student.grade,
  });
  return c.json({ student: updated });
});

app.delete('/admin/top-students/:id', requireAuth, requireAdmin, async (c) => {
  await deleteTopStudent(Number(c.req.param('id')));
  return c.json({ ok: true });
});

/** قائمة امتحانات مصغّرة لعنوان صفحة نتائج الامتحانات (لوحة الأدمن) — رخيصة وبلا أسئلة/إحصائيات. */
app.get('/admin/exams/select', requireAuth, requireAdmin, async (c) => {
  const exams = await listExams();
  return c.json({ exams: exams.map((e) => ({ id: e.id, title: e.title, titleEn: e.titleEn, grade: e.grade, order: e.order ?? 0 })) });
});

/** نتائج امتحان معين بتنازلي الأعلى درجة — بحث بالاسم/التليفون وترقيم. */
app.get('/admin/exam-results/:examId', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  if (!genericRateLimit(`admin-exam-results:${me.id}`, 20, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  const examId = Number(c.req.param('examId'));
  const exam = await findExamById(examId);
  if (!exam) return c.json({ error: 'الامتحان غير موجود' }, 404);
  const url = new URL(c.req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  const search = url.searchParams.get('search') ?? undefined;
  const row = await listExamResultsPage(examId, { page, limit, search });
  return c.json({
    exam: { id: exam.id, title: exam.title, titleEn: exam.titleEn, grade: exam.grade },
    results: row.results,
    total: row.total,
    page: row.page,
    limit: row.limit,
  });
});

/* =================== التوجيه عبر x-path / ?path =================== */

async function ensureBucket(bucket: string): Promise<void> {
  const { data } = await sb.storage.getBucket(bucket);
  if (!data) {
    const { error } = await sb.storage.createBucket(bucket, { public: true });
    if (error) console.warn(`[storage] فشل إنشاء bucket ${bucket}:`, error.message);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? req.headers.get('x-path') ?? '/health';
  const target = new URL(`http://internal${path}`);

  const headers = new Headers(req.headers);
  headers.delete('host');

  const init: RequestInit = { method: req.method, headers, signal: (req as any).signal };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
  }
  return await app.fetch(new Request(target, init));
});

// إعادة تصدير للاستخدام الاختباري (اختياري)
export { app };
