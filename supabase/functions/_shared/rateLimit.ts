/**
 * حدّ معدل بسيط في الذاكرة (لكل مثيل دالة — كافٍ لكبح الهجمات الأساسية
 * على المصادقة). لا يعتمد على أي خدمة خارجية.
 */

const buckets = new Map<string, { count: number; start: number; windowMs: number }>();

/** حد أقصى للذاكرة — عند تجاوزه تُحذف الدلاء المنتهية الصلاحية فقط. */
const MAX_BUCKETS = 2000;

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now - v.start >= v.windowMs) buckets.delete(k);
  }
}

function incr(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now - cur.start >= windowMs) {
    if (!cur && buckets.size >= MAX_BUCKETS) pruneExpired();
    buckets.set(key, { count: 1, start: now, windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}

function count(key: string, windowMs: number): number {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now - cur.start >= windowMs) return 0;
  return cur.count;
}

function clearKey(key: string): void {
  buckets.delete(key);
}

// نافذة IP أطول للحد من الهجمات الموزعة، ونافذة identifier قصيرة حتى لا يُجمَّد
// حساب ضحية بمحاولات خاطئة من طرف مهاجم (كانت 15 دقيقة → 5 دقائق).
const LOGIN_IP_WINDOW = 15 * 60 * 1000; // 15 دقيقة
const LOGIN_IP_MAX = 10;
const LOGIN_ID_WINDOW = 5 * 60 * 1000; // 5 دقائق
const LOGIN_ID_MAX = 5;
const REGISTER_WINDOW = 60 * 60 * 1000; // ساعة
const REGISTER_MAX = 8;

/**
 * عنوان المتصل.
 * الـ Worker يكتب `x-real-ip` من `cf-connecting-ip` ويمسح ما أرسله العميل،
 * فنثق به أولاً. لو وصل الطلب مباشرة (بلا وسيط) نأخذ أول عنوان في
 * `x-forwarded-for` (الأصلي) لا آخره (عنوان الوسيط).
 */
export function ipOf(req: Request): string {
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts[0];
  }
  return 'unknown';
}

export function loginBlocked(ip: string, identifier: string): boolean {
  return (
    count(`login-fail-id:${identifier}`, LOGIN_ID_WINDOW) >= LOGIN_ID_MAX ||
    count(`login-fail-ip:${ip}`, LOGIN_IP_WINDOW) >= LOGIN_IP_MAX
  );
}

export function recordLoginFailure(ip: string, identifier: string): void {
  incr(`login-fail-id:${identifier}`, LOGIN_ID_MAX, LOGIN_ID_WINDOW);
  incr(`login-fail-ip:${ip}`, LOGIN_IP_MAX, LOGIN_IP_WINDOW);
}

/**
 * يحتسب فشلاً على IP فقط (بلا معرّف).
 * يُستخدم عندما يكون المعرّف غير موجود: نحمي من مسح جدول المستخدمين/استهلاك
 * bcrypt دون أن نتيح لمهاجم تجميد أرقام هواتف حقيقية.
 */
export function recordIpFailure(ip: string): void {
  incr(`login-fail-ip:${ip}`, LOGIN_IP_MAX, LOGIN_IP_WINDOW);
}

export function clearLoginFailures(identifier: string): void {
  clearKey(`login-fail-id:${identifier}`);
}

export function registerAllowed(ip: string): boolean {
  return count(`register-ip:${ip}`, REGISTER_WINDOW) < REGISTER_MAX;
}

export function recordRegister(ip: string): void {
  incr(`register-ip:${ip}`, REGISTER_MAX, REGISTER_WINDOW);
}

const GENERIC_WINDOW = 60 * 1000;

// في بيئة الاختبار/التحميل نرفع الحدود تلقائياً لو المتغير LOAD_TEST=1 موجود
const LOAD_TEST_MULTIPLIER = Deno.env.get('LOAD_TEST') === '1' ? 50 : 1;

export function genericRateLimit(key: string, max: number, windowMs: number = GENERIC_WINDOW): boolean {
  return incr(key, max * LOAD_TEST_MULTIPLIER, windowMs);
}
