import { Hono, type Context } from 'npm:hono@^4.6.3';
import { cors } from 'npm:hono@^4.6.3/cors';
import { CORS_ORIGIN, BUCKET_VIDEOS, BUCKET_IMAGES, BUCKET_NOTES } from '../_shared/env.ts';
import { API_VERSION, MIN_CLIENT_VERSION } from '../_shared/version.ts';
import { sb } from '../_shared/supabase.ts';
import { requireAuth, requireAdmin, requireSubscriber, signToken, authCookieHeader, clearAuthCookieHeader, type AuthUser, invalidateUserCache } from '../_shared/auth.ts';
import { hashPassword, verifyPassword } from '../_shared/password.ts';
import { GRADES, isContentGrade, gradeAllowed, contentVisible } from '../_shared/access.ts';import {
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
  bumpTokenVersion,
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
  listCodeFilesWithCodeByUser,
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
  approvePasswordReset,
  completePasswordReset,
  deletePasswordReset,
  getPasswordResetById,
  incrementUnmatchedPasswordReset,
  getPasswordResetDiagnostics,
  invalidateSessionEpoch,
  type ResetStatus,
  listLatestExamTop,
  listExamLeaderboards,
  latestExamRankForUser,
  listExamResultsPage,
  type MyExamRank,
  type Course,
} from '../_shared/db.ts';
import { ipOf, loginBlocked, recordLoginFailure, clearLoginFailures, registerAllowed, recordRegister, genericRateLimit } from '../_shared/rateLimit.ts';

const CODE_LANGUAGES = ['javascript', 'python', 'html', 'css'];
const TOP_GRADES = ['bac1', 'bac2'];

/**
 * تنفيذ مهمة خلفية (مثل إرسال Push) دون أن يقتلها الـ runtime.
 *
 * Supabase Edge Functions يوقف الـ isolate بمجرد إرجاع الرد، فأي `void promise()`
 * غير مُنتظر قد لا يكتمل إطلاقاً — وهذا سبب عدم وصول إشعار "امتحان جديد" رغم أن
 * الإشعار التجريبي (الذي كان `await`ed) يعمل. نستخدم `EdgeRuntime.waitUntil`
 * إن توفّر (الإنتاج)، وإلا ننتظر المهمة نفسها (بيئة محلية).
 */
async function background(task: Promise<unknown>): Promise<void> {
  const safe = task.catch((e) => {
    console.error('[bg]', (e as Error)?.message ?? String(e));
  });
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(safe);
    return;
  }
  await safe;
}

/** bcrypt hash كاذب يُتحقق منه عند غياب المستخدم (تسوية زمن الدخول — ضد timing). */
let dummyHashPromise: Promise<string> | null = null;
function dummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('__dr_code_dummy_password__');
  return dummyHashPromise;
}

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

/**
 * أي تعديل ناجح من الأدمن على المحتوى يُبطل كاش bootstrap في نسخة الدالة الحالية
 * حتى يرى الطلاب التحديث فوراً بدل انتظار انتهاء الـ TTL (نسخ أخرى تنتهي تلقائياً).
 */
const CONTENT_MUTATION_PATH = /^\/(courses|lessons|exams|notes)(\/|$)/;
app.use('*', async (c, next) => {
  await next();
  if (
    c.res.status < 400 &&
    c.req.method !== 'GET' &&
    c.req.method !== 'HEAD' &&
    CONTENT_MUTATION_PATH.test(c.req.path) &&
    // الأدمن فقط يعدّل المحتوى؛ تسليم امتحان الطالب لا يُبطل الكاش.
    c.get('user')?.role === 'admin'
  ) {
    clearBootstrapCache();
  }
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
    return c.json({
      ok: true,
      db: 'up',
      apiVersion: API_VERSION,
      minClientVersion: MIN_CLIENT_VERSION,
      time: Date.now(),
    });
  } catch (e) {
    return c.json({ ok: false, db: 'down', apiVersion: API_VERSION, error: (e as Error).message }, 503);
  }
});

/** فحص نسخة سريع بلا أي استعلام قاعدة — يستخدمه CI بعد كل نشر. */
app.get('/version', (c) =>
  c.json({ apiVersion: API_VERSION, minClientVersion: MIN_CLIENT_VERSION }),
);

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

  const passwordHash = await hashPassword(String(password));
  // لا رفع تلقائي إلى admin من التسجيل — حتى رقم "أدمن" المسجل لا يصبح محذوفاً. يُرفع الحساب يدوياً من القاعدة.
  const user = await createUser({
    fullName: fullName.trim(),
    phone: normPhone,
    grade,
    role: 'student',
    subscription: false,
    blocked: false,
    passwordHash,
    createdAt: Date.now(),
  });

  recordRegister(clientIp);
  // إشعار الأدمن بحساب جديد (بدون أي بيانات حساسة).
  await background(sendPushToAdmins({
    title: '👤 طالب جديد سجّل',
    body: `${user.fullName} — ${GRADES[user.grade] || user.grade || 'بدون صف'}`,
    url: '/admin/students',
    type: 'student',
  }));
  const token = await signToken({ id: user.id, role: user.role, fullName: user.fullName, phone: user.phone, grade: user.grade }, user.tokenVersion ?? 0);
  return c.json({ token, user: safeUser(user) }, 200, { 'Set-Cookie': authCookieHeader(token, c.req.header('host') ?? '') });
});

app.post('/auth/login', async (c) => {
  const clientIp = ipOf(c.req.raw);
  const { identifier, password } = await c.req.json().catch(() => ({}));
  if (!identifier || !password) return c.json({ error: 'التليفون وكلمة المرور مطلوبان' }, 400);
  const loginKey = String(identifier);

  if (loginBlocked(clientIp, loginKey)) {
    return c.json({ error: 'محاولات تسجيل دخول كثيرة، حاول لاحقاً' }, 429);
  }

  const user = await findUserByIdentifier(loginKey);
  if (!user) {
    // تحقق وهمي بنفس كلفة bcrypt للحفاظ على زمن استجابة متساوٍ (ضد هجمات timing).
    await verifyPassword(String(password), await dummyPasswordHash());
    return c.json({ error: 'بيانات الدخول غير صحيحة' }, 401);
  }
  if (!(await verifyPassword(String(password), user.passwordHash))) {
    // نسجّل الفشل على المعرّف فقط إذا كان لحساب حقيقي — حتى لا يتمكن مهاجم من
    // تجميد أرقام عشوائية أو إخفاء محاولات؛ IP يحسب دائماً.
    recordLoginFailure(clientIp, loginKey);
    return c.json({ error: 'بيانات الدخول غير صحيحة' }, 401);
  }
  if (user.blocked) {
    return c.json({ error: 'تم حظر حسابك من قبل إدارة الموقع. تواصل مع الإدارة واتساب: 01068633486' }, 403);
  }

  clearLoginFailures(loginKey);

  // الأدمن على جهاز واحد فقط: نُبطل كل الجلسات السابقة (أي جهاز آخر) لحظة الدخول.
  // الطلاب غير متأثرين — يمكنهم الدخول من أكثر من جهاز كالسابق.
  let tokenVersion = user.tokenVersion ?? 0;
  if (user.role === 'admin') {
    try {
      tokenVersion = await bumpTokenVersion(user.id);
      invalidateUserCache(user.id);
    } catch (e) {
      console.error('[api] login bumpTokenVersion:', (e as Error).message);
    }
  }

  const token = await signToken({ id: user.id, role: user.role, fullName: user.fullName, phone: user.phone, grade: user.grade }, tokenVersion);
  return c.json({ token, user: safeUser(user) }, 200, { 'Set-Cookie': authCookieHeader(token, c.req.header('host') ?? '') });
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

  // تجديد دائم (sliding): كل إقلاع ناجح يُصدر توكناً جديداً ويعيد ضبط الكوكي،
  // ويُعاد التوكن في الجسم ليحفظه العميل كنسخة احتياطية. بهذا لا تنتهي جلسة
  // مستخدم نشط أبداً، وتعود الجلسة كاملة لو ضاع الكوكي أو التخزين المحلي.
  const token = await signToken({ id: user.id, role: user.role, fullName: user.fullName, phone: user.phone, grade: user.grade }, user.tokenVersion ?? 0);
  return c.json({ user: safeUser(user), levels: levels.tiers, examResults, token }, 200, {
    'Set-Cookie': authCookieHeader(token, c.req.header('host') ?? ''),
  });
});

app.post('/auth/logout-all', requireAuth, async (c) => {
  const me = getUser(c);
  try {
    await bumpTokenVersion(me.id);
    // الكاش في الذاكرة كان يحمل النسخة القديمة — نُبطله فوراً وإلا بقي التوكن صالحاً 30 ثانية.
    invalidateUserCache(me.id);
    return c.json({ ok: true }, 200, { 'Set-Cookie': clearAuthCookieHeader(c.req.header('host') ?? '') });
  } catch (e) {
    console.error('[api] logout-all:', (e as Error).message);
    return c.json({ error: 'تعذّر إبطال الجلسات الآن، حاول لاحقاً' }, 500);
  }
});

app.post('/auth/logout', async (c) => {
  return c.json({ ok: true }, 200, { 'Set-Cookie': clearAuthCookieHeader(c.req.header('host') ?? '') });
});

/* =================== طلب تغيير كلمة السر =================== */

/** الطالب يطلب تغيير كلمة السر برقم التليفون. */
app.post('/auth/forgot-password', async (c) => {
  const clientIp = ipOf(c.req.raw);
  if (!genericRateLimit(`forgot-ip:${clientIp}`, 5, 60_000)) {
    return c.json({ error: 'طلبته كتير، انتظر دقيقة قبل المحاولة تاني' }, 429);
  }
  const { phone } = await c.req.json().catch(() => ({}));
  if (!phone || typeof phone !== 'string') return c.json({ error: 'رقم التليفون مطلوب' }, 400);
  const normPhone = normalizePhone(phone);
  if (!normPhone) return c.json({ error: 'رقم التليفون غير صحيح' }, 400);

  // استجابة موحّدة سواء كان الرقم مسجلاً أو لا — حتى لا نكشف وجود حسابات للأرقام العشوائية.
  const user = await findUserByPhone(normPhone);
  if (!user || user.role === 'admin') {
    // إحصائية يومية مبهمة (بدون بيانات شخصية) لمحاولات الأرقام غير المسجلة — تظهر للإدارة لتشخيص الطلبات "الفاتة".
    await incrementUnmatchedPasswordReset().catch(() => {});
    return c.json({ ok: true });
  }
  try {
    const reset = await createPasswordReset(user.id);
    // إشعار الأدمن فوراً — الطلب ينتظر موافقة يدوية، فالتأخير يعني طالباً عالقاً.
    await background(sendPushToAdmins({
      title: '🔑 طلب استعادة كلمة سر',
      body: `${user.fullName || user.phone} — ${GRADES[user.grade] || user.grade || 'بدون صف'}`,
      url: '/admin/students',
      type: 'reset',
    }));
    return c.json({ ok: true, requestId: reset.id });
  } catch (e) {
    console.error('[api] forgot-password createPasswordReset:', (e as Error).message);
    return c.json({ error: 'تعذّر تسجيل طلبك، حاول مرة أخرى أو تواصل مع الإدارة على واتساب' }, 500);
  }
});

/** الطالب يتحقق من حالة طلبه (pending / approved) — محدود التكرار من IP معين. */
app.get('/auth/forgot-password/status', async (c) => {
  const clientIp = ipOf(c.req.raw);
  if (!genericRateLimit(`pr-status-ip:${clientIp}`, 15, 60_000)) {
    return c.json({ error: 'طلبات فحص كثيرة، انتظر قليلاً' }, 429);
  }
  const phone = c.req.query('phone');
  if (!phone || typeof phone !== 'string') return c.json({ error: 'رقم التليفون مطلوب' }, 400);
  const normPhone = normalizePhone(phone);
  if (!normPhone) return c.json({ status: 'none' });

  const user = await findUserByPhone(normPhone);
  if (!user) return c.json({ status: 'none' });

  const reset = await findActivePasswordResetByUser(user.id);
  if (!reset) return c.json({ status: 'none' });
  return c.json({
    status: reset.status,
    codeRequired: reset.status === 'approved',
    codeExpiresAt: reset.codeExpiresAt ?? null,
  });
});

const PASSWORD_RESET_CODE_TTL_MS = 60 * 60 * 1000; // صلاحية الكود: ساعة

/** كود تفعيل عشوائي من 6 أرقام. */
function randomResetCode(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const n = (buf[0] << 16) | (buf[1] << 8) | buf[2];
  return String(100000 + (n % 900000));
}

/** مقارنة نصية ثابتة الزمن لمقاومة قياس التوقيت. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** الطالب يضع كلمة السر الجديدة بعد موافقة الإدارة — يتطلب كود التفعيل المرسل عبر واتساب. */
app.post('/auth/forgot-password/complete', async (c) => {
  const clientIp = ipOf(c.req.raw);
  if (!genericRateLimit(`pr-complete-ip:${clientIp}`, 5, 60_000)) {
    return c.json({ error: 'محاولات كثيرة، انتظر دقيقة' }, 429);
  }
  const { phone, password, code } = await c.req.json().catch(() => ({}));
  if (!phone || typeof phone !== 'string') return c.json({ error: 'رقم التليفون مطلوب' }, 400);
  if (!password || String(password).length < 6) return c.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
  if (!code || !/^\d{6}$/.test(String(code))) return c.json({ error: 'الكود من الإدارة غير صحيح (6 أرقام)' }, 400);
  const normPhone = normalizePhone(phone);
  if (!normPhone) return c.json({ error: 'رقم التليفون غير صحيح' }, 400);

  const user = await findUserByPhone(normPhone);
  // رسالة موحّدة حتى لا نكشف ما إذا كان الرقم مسجلاً أصلاً.
  if (!user) return c.json({ error: 'لا توجد طلبات نشطة لتغيير كلمة السر لهذا الرقم' }, 400);
  if (user.role === 'admin') return c.json({ error: 'لا يمكن تغيير كلمة سر حساب مدير بهذه الطريقة' }, 400);
  if (!genericRateLimit(`pr-complete-phone:${normPhone}`, 8, 60_000)) {
    return c.json({ error: 'محاولات كثيرة لهذا الرقم، انتظر دقيقة' }, 429);
  }

  const reset = await findActivePasswordResetByUser(user.id);
  if (!reset) return c.json({ error: 'لا يوجد طلب نشط لتغيير كلمة السر' }, 400);
  if (reset.status === 'pending') return c.json({ error: 'الطلب لم يتم تفعيله من الإدارة بعد' }, 400);
  if (reset.status === 'completed') return c.json({ error: 'تم استخدام هذا الطلب بالفعل. سجّل الدخول بكلمة السر الجديدة' }, 400);
  if (!reset.resetCode) return c.json({ error: 'لم يُولَّد كود لهذا الطلب، تواصل مع الإدارة' }, 500);
  if (reset.codeExpiresAt && reset.codeExpiresAt < Date.now()) {
    return c.json({ error: 'انتهت صلاحية الكود، أرسل طلباً جديداً لتغيير كلمة السر' }, 400);
  }
  if (!safeEqual(reset.resetCode, String(code))) {
    return c.json({ error: 'الكود غير صحيح، تحقق منه مع الإدارة' }, 400);
  }

  const passwordHash = await hashPassword(String(password));
  await updateUser(user.id, { passwordHash });
  invalidateUserCache(user.id);
  // تغيير كلمة السر يُبطل أي جلسة قديمة (ربما مسروقة) على كل الأجهزة.
  await bumpTokenVersion(user.id).catch(() => {});
  await completePasswordReset(reset.id);

  return c.json({ ok: true });
});

/* =================== المحتوى الكامل (bootstrap) =================== */

/**
 * كاش قصير العمر (45 ثانية) لكل (دور + مرحلة). يخدم عشرات الطلاب المتزامنين
 * من نسخة واحدة بدل إعادة الاستعلام من القاعدة لكل واحد — مع بقاء المحتوى
 * محدّثاً خلال أقل من دقيقة. الأدمن لا يستخدم الكاش ليرى تعديلاته فوراً.
 */
const BOOTSTRAP_CACHE_TTL = 45_000;
const bootstrapCache = new Map<string, { at: number; etag: string; json: string }>();

/** بصمة سريعة (FNV-1a) لتمييز نسخة المحتوى بلا تكلفة تشفير. */
function contentFingerprint(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(36)}.${str.length.toString(36)}`;
}

/** إبطال كاش المحتوى فور أي تعديل من الأدمن (دروس/امتحانات/مذكرات/كورسات). */
export function clearBootstrapCache(): void {
  bootstrapCache.clear();
}

function bootstrapJson(json: string, etag: string, c: Context) {
  return c.body(json, 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    ETag: etag,
    'X-Content-Version': etag,
  });
}

/**
 * يعيد كل المحتوى الثابت في طلب واحد (كورسات، دروس، امتحانات بعدد الأسئلة،
 * مذكرات، أوائل الطلبة، مستويات، مراحل) بعد الفلترة حسب دور/مرحلة المستخدم.
 * تُحفظ النتيجة مؤقتاً في المتصفح لتقليل استعلامات الباك اند بشكل كبير.
 *
 * يدعم أيضاً `?v=<البصمة>`: لو لم يتغير المحتوى نرد بجسم صغير
 * `{ notModified: true }` بدل إعادة تنزيل كل المحتوى على الموبايل.
 */
app.get('/bootstrap', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  if (!genericRateLimit(`bootstrap:${reqUser.id}`, 5, 60_000)) {
    return c.json({ error: 'تم تجاوز الحد المسموح — انتظر دقيقة' }, 429);
  }
  const isAdmin = reqUser.role === 'admin';
  const knownVersion = c.req.query('v') ?? '';
  const cacheKey = isAdmin ? '' : `grade:${reqUser.grade}`;

  // 1. نسخة مخزّنة حديثة: لا استعلامات إطلاقاً.
  const cachedEntry = cacheKey ? bootstrapCache.get(cacheKey) : undefined;
  if (cachedEntry && Date.now() - cachedEntry.at < BOOTSTRAP_CACHE_TTL) {
    if (knownVersion && knownVersion === cachedEntry.etag) {
      return c.json({ notModified: true, contentVersion: cachedEntry.etag }, 200, {
        'Cache-Control': 'private, no-store',
      });
    }
    return bootstrapJson(cachedEntry.json, cachedEntry.etag, c);
  }

  const [courses, lessons, exams, notes, topItems, levels] = await Promise.all([
    isAdmin ? listCourses() : listCoursesByGrade(reqUser.grade),
    isAdmin ? listAllLessons() : listLessonsByGrade(reqUser.grade),
    isAdmin ? listExams() : listExamsByGrade(reqUser.grade),
    isAdmin ? listNotes() : listNotesByGrade(reqUser.grade),
    listTopStudents(),
    getLevels(),
  ]);

  const examIds = exams.map((exam) => exam.id);
  const { data: questionCounts, error: questionCountsError } = examIds.length
    ? await sb.rpc('question_counts_for_exams', { p_exam_ids: examIds })
    : { data: [], error: null };
  if (questionCountsError) {
    console.error('[api] bootstrap question counts:', questionCountsError.message);
    return c.json({ error: 'تعذّر تحميل الامتحانات الآن' }, 503);
  }
  const qByExam = new Map<number, number>();
  for (const row of questionCounts ?? []) {
    qByExam.set(Number(row.exam_id), Number(row.questions_count) || 0);
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

  const json = JSON.stringify({
    courses,
    lessons,
    exams: exams.map((e) => ({ ...e, questionsCount: qByExam.get(e.id) ?? 0 })),
    notes,
    topStudents: students,
    levels: levels.tiers,
    grades: GRADES,
  });
  const etag = contentFingerprint(json) || '0';

  // 2. لم يتغير شيء منذ آخر زيارة ⇒ جسم صغير جداً.
  if (knownVersion && knownVersion === etag) {
    if (cacheKey) bootstrapCache.set(cacheKey, { at: Date.now(), etag, json });
    return c.json({ notModified: true, contentVersion: etag }, 200, { 'Cache-Control': 'private, no-store' });
  }

  // 3. محتوى جديد ⇒ خزّنه للطلاب المشاركين في نفس المرحلة.
  if (cacheKey) bootstrapCache.set(cacheKey, { at: Date.now(), etag, json });
  return bootstrapJson(json, etag, c);
});

/* =================== الكورسات والدروس =================== */

app.get('/courses', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  if (!genericRateLimit(`courses:${reqUser.id}`, 30, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
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
  // Trigger push notification for this grade (or everyone when grade = all)
  const lessonGrade = isContentGrade(b.grade) ? b.grade : 'all';
  await background(sendPushToGrade(lessonGrade, {
    title: '📚 درس جديد',
    body: bodyText(b.title),
    url: `/lessons/${lesson.id}`,
    type: 'lesson',
    id: lesson.id,
  }));
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
  if (!genericRateLimit(`exams:${reqUser.id}`, 30, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
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
    explanation: lastResult ? q.explanation : undefined,
    explanationEn: lastResult ? q.explanationEn : undefined,
    order: q.order,
    // نكشف الإجابة الصحيحة والشرح فقط لمن أدّى الامتحان بالفعل (لا يُكشف قبل بدء الامتحان)
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
    attempts: (existing?.attempts ?? 0) + 1,
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
  // Trigger push notification for this grade (or everyone when grade = all)
  const examGrade = isContentGrade(b.grade) ? b.grade : 'all';
  await background(sendPushToGrade(examGrade, {
    title: '📝 امتحان جديد',
    body: bodyText(b.title),
    url: `/exams/${exam.id}`,
    type: 'exam',
    id: exam.id,
  }));
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
  if (!genericRateLimit(`notes:${reqUser.id}`, 30, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  const isAdmin = reqUser.role === 'admin';
  const notes = (isAdmin ? await listNotes() : await listNotesByGrade(reqUser.grade))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return c.json({ notes });
});

app.get('/notes/:id', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  const noteId = Number(c.req.param('id'));
  if (!Number.isSafeInteger(noteId) || noteId <= 0) return c.json({ error: 'المذكرة غير موجودة' }, 404);
  const note = await findNoteById(noteId);
  if (!note) return c.json({ error: 'المذكرة غير موجودة' }, 404);
  if (reqUser.role === 'student' && !gradeAllowed(note.grade, reqUser.grade)) {
    return c.json({ error: 'المذكرة غير موجودة' }, 404);
  }
  return c.json({ note });
});

app.get('/notes/:id/pdf', requireAuth, requireSubscriber, async (c) => {
  const reqUser = getUser(c);
  if (!genericRateLimit(`note-pdf:${reqUser.id}`, 30, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }

  const noteId = Number(c.req.param('id'));
  if (!Number.isSafeInteger(noteId) || noteId <= 0) {
    return c.json({ error: 'المذكرة غير موجودة' }, 404);
  }
  const note = await findNoteById(noteId);
  if (!note || (reqUser.role === 'student' && !gradeAllowed(note.grade, reqUser.grade))) {
    return c.json({ error: 'المذكرة غير موجودة' }, 404);
  }

  const path = note.pdf.trim();
  if (!/^\d+-[\w\u0600-\u06FF.-]+\.pdf$/i.test(path)) {
    return c.json({ error: 'ملف PDF غير متاح للعرض' }, 404);
  }

  const { data, error } = await sb.storage.from(BUCKET_NOTES).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    console.error('[api] notes/pdf signed URL:', error?.message ?? 'empty URL');
    return c.json({ error: 'تعذّر فتح ملف PDF الآن' }, 503);
  }

  return c.json({ url: data.signedUrl }, 200, {
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  });
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
    pdf: bodyText(b.pdf),
    grade: isContentGrade(b.grade) ? b.grade : 'all',
    order: Number(b.order) || 0,
    createdAt: Date.now(),
  });
  // Trigger push notification for this grade (or everyone when grade = all)
  const noteGrade = isContentGrade(b.grade) ? b.grade : 'all';
  await background(sendPushToGrade(noteGrade, {
    title: '📖 مذكرة جديدة',
    body: bodyText(b.title),
    url: '/notes',
    type: 'note',
    id: note.id,
  }));
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
    pdf: b.pdf !== undefined ? bodyText(b.pdf) : note.pdf,
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
  if (!genericRateLimit(`code:${reqUser.id}`, 30, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  const files = (
    c.req.query('withCode') === '1'
      ? await listCodeFilesWithCodeByUser(reqUser.id)
      : await listCodeFilesByUser(reqUser.id)
  ).map((f) => ({
    id: f.id,
    name: f.name,
    language: f.language,
    ...(c.req.query('withCode') === '1' ? { code: f.code } : {}),
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
  const clientIp = ipOf(c.req.raw);
  // 60/دقيقة: صفحة عامة، كاش 120 ثانية، حد أعلى من الحاجة مع أريحية
  if (!genericRateLimit(`top-students:${clientIp}`, 60, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
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
  c.header('Cache-Control', 'public, max-age=120');
  return c.json({ students });
});

/** أوائل ٣ من "الامتحان الأخير" لكل مرحلة (فرعي) — عام مثل /top-students، بكاش 60 ثانية. */
let latestExamTopCache: { at: number; data: unknown } | null = null;
const LATEST_EXAM_TOP_TTL = 60_000;

/** أوائل ٣ لكل امتحان — بكاش 5 دقائق؛ يُبطَل مع كاش آخر امتحان بعد تسجيل أي نتيجة. */
let examLeaderboardsCache: { at: number; data: unknown } | null = null;
const EXAM_LEADERBOARDS_TTL = 5 * 60_000;

/** ترتيب كل طالب في آخر امتحان — 30 ثانية لكل مستخدم (لا يُخزَّن على خادم مشترك). */
const myExamRankCache = new Map<number, { at: number; data: MyExamRank }>();
const MY_EXAM_RANK_TTL = 30_000;
const MY_EXAM_RANK_MAX = 5_000;

function clearLatestExamTopCache(): void {
  latestExamTopCache = null;
  examLeaderboardsCache = null;
  myExamRankCache.clear();
}

app.get('/latest-exam-top', async (c) => {
  const clientIp = ipOf(c.req.raw);
  // 120/دقيقة: يدعم تحديثًا تلقائيًا كل 60 ثانية من صفحة top-students حتى على
  // الشبكات المشتركة (مدرسة/بيت) دون إصدار 429.
  if (!genericRateLimit(`latest-exam-top:${clientIp}`, 120, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  if (latestExamTopCache && Date.now() - latestExamTopCache.at < LATEST_EXAM_TOP_TTL) {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(latestExamTopCache.data);
  }
  const data = { leaderboards: await listLatestExamTop() };
  latestExamTopCache = { at: Date.now(), data };
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(data);
});

/**
 * أوائل ٣ لكل امتحان (أوائل الطور) — عام مثل /latest-exam-top و /top-students.
 */
app.get('/exam-leaderboards', async (c) => {
  const clientIp = ipOf(c.req.raw);
  // 30/دقيقة: الصفحة بتطلب مرة واحدة مع الكاش، والحد أعلى من الحاجة مع أريحية.
  if (!genericRateLimit(`exam-leaderboards:${clientIp}`, 30, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  if (examLeaderboardsCache && Date.now() - examLeaderboardsCache.at < EXAM_LEADERBOARDS_TTL) {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(examLeaderboardsCache.data);
  }
  const data = { leaderboards: await listExamLeaderboards() };
  examLeaderboardsCache = { at: Date.now(), data };
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(data);
});

/* =================== الفهرس العام (SEO) =================== */

/** يحوّل الكورس إلى حقول عامة فقط (بلا أي بيانات حساسة أو فيديوهات). */
function publicCourse(course: Course, stats?: { count: number; duration: number }) {
  return {
    id: course.id,
    title: course.title,
    titleEn: course.titleEn,
    description: course.description,
    descriptionEn: course.descriptionEn,
    image: course.image,
    grade: course.grade,
    gradeName: GRADES[course.grade]?.name ?? course.grade,
    order: course.order,
    lessonCount: stats?.count ?? 0,
    duration: stats?.duration ?? 0,
  };
}

/** كتالوج الكورسات العام — متاح بلا مصادقة لأغراض الفهرسة والعرض. */
app.get('/public/courses', async (c) => {
  const clientIp = ipOf(c.req.raw);
  if (!genericRateLimit(`public-courses:${clientIp}`, 60, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  const [courses, lessonStats] = await Promise.all([listCourses(), listLessonStats()]);
  const statsMap = new Map(lessonStats.map((s) => [s.courseId, s]));
  const out = courses
    .map((course) => publicCourse(course, statsMap.get(course.id)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ courses: out });
});

/** تفاصيل كورس عامة: بيانات الكورس + عناوين الدروس فقط (بدون روابط فيديو). */
app.get('/public/courses/:id', async (c) => {
  const clientIp = ipOf(c.req.raw);
  if (!genericRateLimit(`public-course:${clientIp}`, 120, 60_000)) {
    return c.json({ error: 'طلبات كثيرة، انتظر دقيقة' }, 429);
  }
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'معرّف غير صالح' }, 400);
  const course = await findCourseById(id);
  if (!course) return c.json({ error: 'الكورس غير موجود' }, 404);

  const [lessons, lessonStats, examsCount] = await Promise.all([
    listLessonsByCourse(id),
    listLessonStats(),
    countExamsByCourse(id),
  ]);
  const stat = lessonStats.find((s) => s.courseId === id);
  const lessonList = lessons
    .map((l) => ({
      id: l.id,
      title: l.title,
      titleEn: l.titleEn,
      duration: l.duration,
      grade: l.grade,
      order: l.order,
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ course: publicCourse(course, stat), lessons: lessonList, examsCount });
});

/**
 * ترتيب الطالب الحقيقي في آخر امتحان (خاص بالمستخدم).
 * لا يُخترع أي رقم: إن لم يشارك يظهر taken=false، وإن تعذّرت دقة الحساب يظهر rank=null.
 */
app.get('/my-exam-rank', requireAuth, requireSubscriber, async (c) => {
  const me = getUser(c);
  const hit = myExamRankCache.get(me.id);
  if (hit && Date.now() - hit.at < MY_EXAM_RANK_TTL) {
    c.header('Cache-Control', 'private, no-store');
    return c.json(hit.data);
  }
  const data = await latestExamRankForUser(me.id, me.grade);
  // سقف أمان: الخريطة تنمو بعدد المستخدمين بين المسح، فنمسحها كلها عند التجاوز
  if (myExamRankCache.size >= MY_EXAM_RANK_MAX) myExamRankCache.clear();
  myExamRankCache.set(me.id, { at: Date.now(), data });
  c.header('Cache-Control', 'private, no-store');
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

/** إبطال كل جلسات تسجيل الدخول (سحب الصلاحيات من كل الأجهزة) — يرفع epoch الجلسات فوراً. */
app.post('/admin/session/epoch', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  if (!genericRateLimit(`admin-epoch:${me.id}`, 2, 60_000)) {
    return c.json({ error: 'انتظر دقيقة بين كل استدعاء' }, 429);
  }
  const epoch = Date.now();
  const { error } = await sb.from('app_config').upsert({ key: 'session_epoch', value: epoch }, { onConflict: 'key' });
  if (error) {
    console.error('[api] session epoch upsert:', error.message);
    return c.json({ error: 'فشل إبطال الجلسات، حاول مرة أخرى' }, 500);
  }
  invalidateSessionEpoch();
  return c.json({ ok: true, epoch });
});

/** نسخة كاملة من كل المستخدمين مع إحصائياتهم في طلب واحد (بدون pagination أو استعلامات count) —
 *  تُستخدم في لوحة الطلبة حيث تتم الفلترة والبحث والترقيم في المتصفح لتخفيف الضغط على الباك اند.
 *  limit إلزامي (1–500) حتى لا يُفرَّغ كل الجداول بأمر واحد. */
app.get('/admin/users/all', requireAuth, requireAdmin, async (c) => {
  const me = getUser(c);
  if (!genericRateLimit(`admin-users-all:${me.id}`, 1, 30_000)) {
    return c.json({ error: 'انتظر 30 ثانية بين كل طلب' }, 429);
  }
  const url = new URL(c.req.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
    return c.json({ error: 'حقل limit مطلوب (رقم صحيح بين 1 و 500)' }, 400);
  }
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const all = await listAllUsers({ limit, offset });
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
  const { count } = await sb.from('users').select('id', { count: 'exact', head: true });
  return c.json({ users: out, total: count ?? 0, page: Math.floor(offset / limit) + 1, limit, offset });
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

/** إحصاءات تشخيصية لطلبات كلمة السر — عدادت وتوقيتات فقط (بدون بيانات الطلاب) لتمييز "لا توجد طلبات" عن مشكلة تسجيل. */
app.get('/admin/password-resets/diagnose', requireAuth, requireAdmin, async (c) => {
  const diag = await getPasswordResetDiagnostics();
  return c.json(diag);
});

/** موافقة على طلب تغيير كلمة السر → يولَّد كود من 6 أرقام (صلاحية ساعة) يُعاد مع بيانات الطالب لتمكين واتساب. */
app.post('/admin/password-resets/:id/approve', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'معرف غير صحيح' }, 400);
  // قراءة مباشرة بالمعرّف — القائمة محدودة بـ limit، فالاعتماد عليها كان
  // يجعل أي طلب أقدم من نافذة القائمة يُرجع 404 ويُفقد المدير القدرة على الموافقة عليه.
  const req = await getPasswordResetById(id);
  if (!req) return c.json({ error: 'الطلب غير موجود' }, 404);
  if (req.status === 'completed') return c.json({ error: 'تم إتمام هذا الطلب بالفعل' }, 400);

  const code = randomResetCode();
  const updated = await approvePasswordReset(id, code, PASSWORD_RESET_CODE_TTL_MS);
  if (!updated) return c.json({ error: 'فشل تحديث الحالة' }, 500);

  const user = await findUserById(req.userId);
  return c.json({
    ok: true,
    fullName: user?.fullName ?? req.fullName,
    phone: user?.phone ?? req.phone,
    code,
    codeExpiresAt: updated.codeExpiresAt,
  });
});

/** رفض طلب تغيير كلمة السر → يُرفض الطلب. */
app.post('/admin/password-resets/:id/reject', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'معرف غير صحيح' }, 400);
  // قراءة مباشرة بالمعرّف حتى لا تسقط الطلبات الأقدم من نافذة القائمة.
  const req = await getPasswordResetById(id);
  if (!req) return c.json({ error: 'الطلب غير موجود' }, 404);
  if (req.status === 'completed') return c.json({ error: 'لا يمكن رفض طلب تم إتمامه' }, 400);

  await updatePasswordResetStatus(id, 'rejected');
  return c.json({ ok: true });
});

/**
 * حذف نهائي لطلب تغيير كلمة السر — مسموح في أي حالة (pending/approved/completed/rejected).
 * الغرض: إخلاء القائمة من الطلبات القديمة حتى لا تتراكم أرقام قديمة وتُضعف قراءتها.
 * حذف طلب approved يُبطل كوده، فالمسؤولية على تأكيد الواجهة قبل النداء.
 */
app.delete('/admin/password-resets/:id', requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'معرف غير صحيح' }, 400);

  // نقرأ السجل بمعرّفه مباشرة لا من القائمة (محدودة بـ limit).
  const req = await getPasswordResetById(id);
  if (!req) return c.json({ error: 'الطلب غير موجود' }, 404);

  const deleted = await deletePasswordReset(id);
  if (!deleted) return c.json({ error: 'فشل حذف الطلب' }, 500);
  return c.json({ ok: true, id });
});

/* =================== Push Notifications =================== */

interface PushSubscriptionRow {
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
}

/**
 * المفتاح العام لـ Web Push — عام بطبيعته (يُرسل لكل متصفح يشترك).
 * نُرجعه من الخادم وقت التشغيل حتى لا تتوقف الإشعارات على متغيّر وقت البناء
 * (لو نُسي عند البناء يفشل الاشتراك بصمت ولا يصل أي إشعار).
 */
app.get('/push/public-key', (c) => {
  const key = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  return c.json({ key, configured: !!key }, 200, { 'Cache-Control': 'public, max-age=3600' });
});

/** تشخيص حالة الإشعارات للمستخدم الحالي + جاهزية الخادم. */
app.get('/push/status', requireAuth, async (c) => {
  const user = getUser(c);
  const { count, error } = await sb
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  return c.json({
    vapidConfigured: !!Deno.env.get('VAPID_PUBLIC_KEY') && !!Deno.env.get('VAPID_PRIVATE_KEY'),
    subscriptions: error ? -1 : (count ?? 0),
  });
});

/** حفظ اشتراك push للمستخدم (يحل محل أي اشتراك سابق لنفس الـ endpoint). */
app.post('/push/subscribe', requireAuth, requireSubscriber, async (c) => {
  const user = getUser(c);
  const { endpoint, p256dh, auth } = await c.req.json().catch(() => ({}));
  if (!endpoint || !p256dh || !auth) return c.json({ error: 'بيانات الاشتراك ناقصة' }, 400);

  const at = Date.now();
  // Upsert by endpoint (unique per device)
  const { error } = await sb
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh, auth, created_at: at }, { onConflict: 'endpoint' });
  if (error) {
    console.error('[api] push/subscribe upsert:', error.message);
    return c.json({ error: 'تعذّر حفظ الاشتراك' }, 500);
  }
  return c.json({ ok: true });
});

/** حذف اشتراك push للمستخدم. */
app.post('/push/unsubscribe', requireAuth, requireSubscriber, async (c) => {
  const user = getUser(c);
  const { endpoint } = await c.req.json().catch(() => ({}));
  if (!endpoint) return c.json({ error: 'endpoint مطلوب' }, 400);

  const { error } = await sb.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
  if (error) {
    console.error('[api] push/unsubscribe delete:', error.message);
    return c.json({ error: 'تعذّر حذف الاشتراك' }, 500);
  }
  return c.json({ ok: true });
});

/** إرسال push تجريبي للمستخدم الحالي. */
app.post('/push/test', requireAuth, requireSubscriber, async (c) => {
  const user = getUser(c);
  await sendPushToUser(user.id, {
    title: '🔔 DR Code',
    body: 'هذا إشعار تجريبي! الإشعارات تعمل بنجاح.',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    url: '/',
    type: 'test',
  });
  return c.json({ ok: true });
});

/** إرسال push لكل مشتركي مرحلة معينة (أو للجميع عند grade = all) عند إضافة محتوى جديد. */
interface PushSubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayloadServer {
  title: string;
  body: string;
  url?: string;
  type?: 'lesson' | 'exam' | 'note' | 'test' | 'reset' | 'student';
  id?: number;
  icon?: string;
  badge?: string;
  /** كل الحقول التالية اختيارية وللتوافق مع أجهزة/متصفحات مختلفة. */
  tag?: string;
  sound?: string;
  vibrate?: number[];
  silent?: boolean;
  requireInteraction?: boolean;
}

/** يهيّئ web-push مرة واحدة لكل استدعاء. يرجع null لو مفاتيح VAPID غير مضبوطة. */
async function configureWebPush() {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!vapidPublic || !vapidPrivate) {
    console.warn('[push] VAPID keys not configured — skipping push (set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY secrets)');
    return null;
  }
  // استيراد ديناميكي: لو تعذّر تحميل الحزمة لا تتأثر بقية الـ API إطلاقاً.
  const webPush = (await import('npm:web-push@^3.6.7')).default;
  webPush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@drcode.com',
    vapidPublic,
    vapidPrivate,
  );
  return webPush;
}

/** يرسل نفس الإشعار لكل الاشتراكات، ويحذف الاشتراكات المنتهية (404/410). */
async function deliverPush(subs: PushSubRow[], payload: PushPayloadServer): Promise<void> {
  if (!subs.length) return;
  try {
    const webPush = await configureWebPush();
    if (!webPush) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon ?? '/pwa-192.png',
      badge: payload.badge ?? '/pwa-192.png',
      // الصوت والاهتزاز: `sound` يُتجاهل على كروم/أندرويد لكنه يعمل على بعض
      // الأجهزة، والاهتزاز يعمل على أندرويد. الواجهة المفتوحة تشغّل نغمتها
      // بنفسها استجابةً لرسالة الـ Service Worker.
      sound: payload.sound ?? 'default',
      vibrate: payload.vibrate ?? [200, 100, 200],
      silent: payload.silent ?? false,
      requireInteraction: payload.requireInteraction ?? false,
      tag: payload.tag ?? `drcode-${payload.type ?? 'test'}`,
      type: payload.type ?? 'test',
      data: {
        url: payload.url ?? '/',
        type: payload.type ?? 'test',
        id: payload.id ?? 0,
        tag: payload.tag ?? `drcode-${payload.type ?? 'test'}`,
      },
    });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        ),
      ),
    );

    await Promise.all(
      results.map(async (result, index) => {
        if (result.status === 'fulfilled') return;
        const statusCode = (result.reason as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // اشتراك منتهي: احذفه حتى لا يتكرر فشل الإرسال له.
          try {
            await sb.from('push_subscriptions').delete().eq('endpoint', subs[index].endpoint);
          } catch {
            /* ignore */
          }
        } else {
          console.error('[push] send failed:', (result.reason as Error)?.message ?? String(result.reason));
        }
      }),
    );
  } catch (e) {
    console.error('[push] deliverPush error:', (e as Error).message);
  }
}

/** إرسال push لجهاز/أجهزة مستخدم واحد (إشعار تجريبي). */
export async function sendPushToUser(userId: number, payload: PushPayloadServer): Promise<void> {
  const { data, error } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .limit(20);
  if (error) {
    console.error('[push] load subscriptions:', error.message);
    return;
  }
  await deliverPush((data ?? []) as PushSubRow[], payload);
}

/**
 * إرسال push لكل من يهمه محتوى جديد في مرحلة معينة.
 *
 * القاعدة:
 * - الأدمن: يصله دائماً (هو من يضيف المحتوى ويحتاج تأكيداً أن التنبيه يعمل).
 * - الطالب المشترك: يصله لو كانت مرحلته مطابقة، أو كان المحتوى لكل المراحل.
 * - غير المشترك: لا يصله (المحتوى مقفول عليه أصلاً).
 *
 * لا نفلتر `subscription` في استعلام SQL لأن ذلك يستبعد الأدمن (غالباً غير
 * مشترك مدفوع) — نجلب الصفوف ثم نفلتر في JS.
 */
export async function sendPushToGrade(grade: string, payload: PushPayloadServer): Promise<void> {
  try {
    const { data, error } = await sb
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, users!inner(id, role, subscription, grade)')
      .limit(1000);
    if (error) {
      console.error('[push] load grade subscriptions:', error.message);
      return;
    }

    type Row = PushSubRow & {
      users?: { role?: string | null; subscription?: boolean | null; grade?: string | null } | null;
    };

    const subs = ((data ?? []) as Row[]).filter((row) => {
      const user = row.users;
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (!user.subscription) return false;
      if (!grade || grade === 'all') return true;
      return user.grade === grade;
    });

    await deliverPush(subs, payload);
  } catch (e) {
    console.error('[push] sendPushToGrade error:', (e as Error).message);
  }
}

/** إرسال تنبيه إداري لكل أجهزة الأدمن (حساب جديد / طلب استعادة كلمة سر). */
export async function sendPushToAdmins(payload: PushPayloadServer): Promise<void> {
  try {
    const { data, error } = await sb
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, users!inner(id, role)')
      .eq('users.role', 'admin')
      .limit(50);
    if (error) {
      console.error('[push] load admin subscriptions:', error.message);
      return;
    }
    await deliverPush((data ?? []) as PushSubRow[], payload);
  } catch (e) {
    console.error('[push] sendPushToAdmins error:', (e as Error).message);
  }
}

// رابط رفع مباشر إلى Storage (تجاوز حد الحجم في الدوال) — يوقّع URL ثم يرفع المتصفح مباشرة
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']);
const MAX_NOTE_PDF_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTS = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXTS = /\.(mp4|webm|mov|ogv|ogg)$/i;
const PDF_EXT = /\.pdf$/i;

app.post('/admin/upload-url', requireAuth, requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const bucketKey = b.bucket;
  if (bucketKey !== 'images' && bucketKey !== 'videos' && bucketKey !== 'notes') {
    return c.json({ error: 'نوع الملف غير مدعوم' }, 400);
  }
  const bucket = bucketKey === 'images'
    ? BUCKET_IMAGES
    : bucketKey === 'notes'
      ? BUCKET_NOTES
      : BUCKET_VIDEOS;
  const fileName = String(b.fileName ?? 'file');
  const contentType = String(b.contentType ?? 'application/octet-stream');
  const fileSize = Number(b.fileSize);

  const isImage = bucketKey === 'images';
  const isPdf = bucketKey === 'notes';
  const typeOk = isImage
    ? ALLOWED_IMAGE_TYPES.has(contentType)
    : isPdf
      ? contentType === 'application/pdf'
      : ALLOWED_VIDEO_TYPES.has(contentType);
  const extOk = isImage
    ? IMAGE_EXTS.test(fileName)
    : isPdf
      ? PDF_EXT.test(fileName)
      : VIDEO_EXTS.test(fileName);
  if (!typeOk || !extOk) {
    const message = isImage
      ? 'صيغة الصورة غير مسموحة (png/jpeg/webp/gif)'
      : isPdf
        ? 'يجب اختيار ملف PDF صالح'
        : 'صيغة الفيديو غير مسموحة (mp4/webm/mov/ogv)';
    return c.json(
      { error: message },
      400,
    );
  }
  if (isPdf && (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_NOTE_PDF_BYTES)) {
    return c.json({ error: 'حجم ملف PDF يجب ألا يتجاوز 20 ميجابايت' }, 400);
  }

  const bucketOptions = isPdf
    ? { public: false, fileSizeLimit: MAX_NOTE_PDF_BYTES, allowedMimeTypes: ['application/pdf'] }
    : { public: true };
  await ensureBucket(bucket, bucketOptions);
  // Supabase Storage \u064A\u062A\u0637\u0644\u0628 \u0623\u0633\u0645\u0627\u0621 \u0645\u0644\u0641\u0627\u062A \u0628\u0640 ASCII \u0641\u0642\u0637 (\u0628\u062F\u0648\u0646 \u062D\u0631\u0648\u0641 \u0639\u0631\u0628\u064A\u0629)
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]+/g, '-');
  const safePath = isPdf
    ? `${Date.now()}-${safeName.replace(/\.pdf$/i, '').slice(0, 36) || 'note'}.pdf`
    : `${Date.now()}-${safeName.slice(0, 40)}`;
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(safePath, { upsert: true });
  if (error || !data) return c.json({ error: error?.message ?? 'فشل إنشاء رابط الرفع' }, 400);
  if (isPdf) {
    return c.json({ uploadUrl: data.signedUrl, path: safePath, publicUrl: '', contentType });
  }
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

async function ensureBucket(
  bucket: string,
  options: { public: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] },
): Promise<void> {
  const { data } = await sb.storage.getBucket(bucket);
  if (!data) {
    const { error } = await sb.storage.createBucket(bucket, options);
    if (error) throw new Error(`[storage] تعذّر إنشاء bucket ${bucket}: ${error.message}`);
    return;
  }
  if (!options.public) {
    const { error } = await sb.storage.updateBucket(bucket, options);
    if (error) throw new Error(`[storage] تعذّر ضبط bucket ${bucket} كمساحة خاصة: ${error.message}`);
  }
}

const FUNCTION_MOUNT = '/functions/v1/';

/**
 * يستخرج مسار الـ API الحقيقي من رابط الطلب.
 * Supabase يركّب الدالة تحت /functions/v1/<اسم-الدالة>، فيصل pathname
 * مع تلك البادئة. كان الكود يقرأ المسار من header باسم "x-path" فقط، فأي طلب
 * لا يحمله (كوكي من بروكسي، أداة، أو طلب مباشر) كان يُعامل على أنه /health
 * فيرجع {ok:true} لكل المسارات — وهو سبب ظهور "unauthorized" وصفحات فارغة.
 */
function resolveApiPath(url: URL, req: Request): string {
  // تجاوز صريح: نحافظ على التوافق مع عميل قديم يعتمد x-path أو ?path
  const explicit = url.searchParams.get('path') ?? req.headers.get('x-path');
  if (explicit) return explicit.startsWith('/') ? explicit : `/${explicit}`;

  const mountAt = url.pathname.indexOf(FUNCTION_MOUNT);
  const afterMount = mountAt === -1 ? url.pathname : url.pathname.slice(mountAt + FUNCTION_MOUNT.length);

  // "api/auth/me" تصبح "auth/me": نزع شرطات البداية، ثم اسم الدالة، ثم ما تلاها
  const trimmed = afterMount.replace(/^\/+/, '');
  const rest = trimmed.replace(/^api(?=\/|$)/, '').replace(/^\/+/, '');
  const route = rest ? `/${rest}` : '/health';

  // نحفظ query string لأن الـ handlers تقرأ منه (ترقيم، فلاتر، حدود)
  const qs = url.searchParams.toString();
  return qs ? `${route}?${qs}` : route;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const target = new URL(`http://internal${resolveApiPath(url, req)}`);

  const headers = new Headers(req.headers);
  headers.delete('host');
  // المسار الآن يُقرأ من الرابط نفسه، فلا نحتاج هذا header
  headers.delete('x-path');

  const init: RequestInit = {
    method: req.method,
    headers,
    signal: (req as any).signal,
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
  }
  return await app.fetch(new Request(target, init));
});

// إعادة تصدير للاستخدام الاختباري (اختياري)
export { app };
