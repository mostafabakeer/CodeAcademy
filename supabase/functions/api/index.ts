import { Hono, type Context } from 'npm:hono@^4.6.3';
import { cors } from 'npm:hono@^4.6.3/cors';
import { CORS_ORIGIN, BUCKET_VIDEOS, BUCKET_IMAGES, BUCKET_BACKUPS } from '../_shared/env.ts';
import { sb } from '../_shared/supabase.ts';
import { requireAuth, requireAdmin, requireSubscriber, signToken, authCookieHeader, clearAuthCookieHeader, type AuthUser } from '../_shared/auth.ts';
import { hashPassword, verifyPassword } from '../_shared/password.ts';
import { GRADES, isContentGrade, gradeAllowed, contentVisible } from '../_shared/access.ts';
import {
  computeStudentStats,
  computeStudentStatsBatch,
  countAdmins,
  findUserById,
  findUserByPhone,
  findUserByIdentifier,
  createUser,
  updateUser,
  deleteUser,
  safeUser,
  listUsers,
  listAllUsers,
  listCourses,
  findCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  listAllLessons,
  findLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
  listExams,
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
  getProgress,
  upsertWatch,
  getResult,
  listResultsByUser,
  listCodeFilesByUser,
  createCodeFile,
  updateCodeFile,
  patchCodeFile,
  deleteCodeFile,
  getLevels,
  setLevels,
  adminStats,
  submitExam,
  normalizePhone,
} from '../_shared/db.ts';
import { ipOf, loginBlocked, recordLoginFailure, clearLoginFailures, registerAllowed, recordRegister } from '../_shared/rateLimit.ts';

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
  return c.json({ error: (err as Error).message || 'Internal error' }, 500);
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

  const isFirstAdmin = (await countAdmins()) === 0;
  const passwordHash = await hashPassword(String(password));
  const role = isFirstAdmin ? ('admin' as const) : ('student' as const);
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
  const stats = await computeStudentStats(user.id);
  return c.json({ user: safeUser(user), stats });
});

app.post('/auth/logout', async (c) => {
  return c.json({ ok: true }, 200, { 'Set-Cookie': clearAuthCookieHeader() });
});

/* =================== الكورسات والدروس =================== */

app.get('/courses', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const allCourses = await listCourses();
  const courses = allCourses.filter((co) => contentVisible(reqUser.role, co.grade, reqUser.grade));
  const lessons = await listAllLessons();
  const progresses = await listProgressByUser(reqUser.id);
  const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

  const out = courses.map((course) => {
    const courseLessons = lessons.filter((l) => l.courseId === course.id && contentVisible(reqUser.role, l.grade, reqUser.grade));
    let duration = 0;
    let watched = 0;
    let completed = 0;
    for (const l of courseLessons) {
      const d = Number(l.duration) || 0;
      duration += d;
      const w = Math.min(watchByLesson.get(l.id) ?? 0, d);
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

  const allLessons = await listAllLessons();
  const lessons = allLessons.filter((l) => l.courseId === id && contentVisible(reqUser.role, l.grade, reqUser.grade));
  const progresses = await listProgressByUser(reqUser.id);
  const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

  const lessonList = lessons
    .map((l) => {
      const d = Number(l.duration) || 0;
      const w = Math.min(watchByLesson.get(l.id) ?? 0, d);
      return { ...l, watchedSeconds: w, completed: d > 0 && w >= d * 0.9, progressPct: d > 0 ? Math.round((w / d) * 100) : 0 };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const exams = (await listExams()).filter((e) => e.courseId === id && contentVisible(reqUser.role, e.grade, reqUser.grade)).length;

  return c.json({ course, lessons: lessonList, examsCount: exams });
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

  const allLessons = await listAllLessons();
  const lessons = allLessons.filter(
    (l) => l.courseId === lesson.courseId && contentVisible(reqUser.role, l.grade ?? course?.grade, reqUser.grade)
  );
  const progress = await getProgress(reqUser.id, id);
  const progresses = await listProgressByUser(reqUser.id);
  const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

  const duration = Number(lesson.duration) || 0;
  const watched = progress?.secondsWatched ?? Math.min(watchByLesson.get(id) ?? 0, duration);
  const out = {
    ...lesson,
    watchedSeconds: watched,
    completed: duration > 0 ? watched >= duration * 0.9 : false,
    progressPct: duration > 0 ? Math.round((watched / duration) * 100) : 0,
  };

  return c.json({
    lesson: out,
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, titleEn: l.titleEn })),
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
  const exams = (await listExams()).filter((e) => contentVisible(reqUser.role, e.grade, reqUser.grade));
  const results = await listResultsByUser(reqUser.id);
  const resultByExam = new Map(results.map((res) => [res.examId, res]));
  const { data: allQuestions } = await sb.from('questions').select('exam_id');
  const qByExam = new Map<number, number>();
  for (const q of allQuestions ?? []) {
    const ex = Number(q.exam_id);
    qByExam.set(ex, (qByExam.get(ex) ?? 0) + 1);
  }

  const out = exams
    .map((exam) => ({
      ...exam,
      questionsCount: qByExam.get(exam.id) ?? 0,
      taken: resultByExam.has(exam.id),
      bestScore: resultByExam.get(exam.id)?.best ?? null,
      attempts: resultByExam.get(exam.id)?.attempts ?? 0,
    }))
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
  const questions = (await listQuestionsByExam(id)).map((q) => ({
    id: q.id,
    text: q.text,
    textEn: q.textEn,
    options: q.options,
    hasImage: !!q.image,
    image: q.image,
    order: q.order,
  }));
  const lastResult = await getResult(reqUser.id, id);
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
  return c.json({ exam: updated });
});

app.delete('/exams/:id', requireAuth, requireAdmin, async (c) => {
  await deleteExam(Number(c.req.param('id')));
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
  const notes = (await listNotes())
    .filter((n) => contentVisible(reqUser.role, n.grade, reqUser.grade))
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

/* =================== التقدم =================== */

app.post('/progress/watch', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const { lessonId, seconds } = await c.req.json().catch(() => ({}));
  if (!lessonId || typeof seconds !== 'number') {
    return c.json({ error: 'lessonId و seconds مطلوبان' }, 400);
  }
  const outcome = await upsertWatch(reqUser.id, Number(lessonId), Number(seconds));
  if (!outcome) return c.json({ error: 'الدرس غير موجود' }, 404);
  return c.json({ progress: outcome.progress, completed: outcome.completed, duration: outcome.duration });
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
  const file = await listCodeFilesByUser(reqUser.id).then((all) => all.find((f) => f.id === Number(c.req.param('id'))) ?? null);
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

/* =================== لوحة الأدمن =================== */

app.get('/admin/stats', requireAuth, requireAdmin, async (c) => {
  return c.json({ stats: await adminStats() });
});

app.get('/admin/users', requireAuth, requireAdmin, async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const search = url.searchParams.get('search') ?? undefined;
  const { users, total } = await listUsers({ page, limit, search });
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
  return c.json({ users: out.sort((a, b) => b.points - a.points), total, page, limit });
});

app.get('/admin/lessons', requireAuth, requireAdmin, async (c) => {
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
  const id = Number(c.req.param('id'));
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  const { role } = await c.req.json().catch(() => ({}));
  if (!['student', 'admin'].includes(role)) return c.json({ error: 'دور غير صحيح' }, 400);
  const updated = await updateUser(id, { role });
  return c.json({ user: safeUser(updated!) });
});

app.put('/admin/users/:id/subscription', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  const { subscription } = await c.req.json().catch(() => ({}));
  const updated = await updateUser(id, { subscription: !!subscription });
  return c.json({ user: safeUser(updated!) });
});

app.put('/admin/users/:id/block', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const user = await findUserById(id);
  if (!user) return c.json({ error: 'المستخدم غير موجود' }, 404);
  const { blocked } = await c.req.json().catch(() => ({}));
  const updated = await updateUser(id, { blocked: !!blocked });
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
