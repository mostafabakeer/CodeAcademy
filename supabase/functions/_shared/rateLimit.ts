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

const LOGIN_WINDOW = 15 * 60 * 1000; // 15 دقيقة
const LOGIN_FAIL_MAX = 5;
const REGISTER_WINDOW = 60 * 60 * 1000; // ساعة
const REGISTER_MAX = 8;

/**
 * عنوان المتصل — نفضّل x-real-ip (يضعه Cloudflare) وإلا آخر قيمة من
 * x-forwarded-for (التي يضيفها الوكيل الموثوق) بدل الأولى القابلة للتزوير.
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
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}

export function loginBlocked(ip: string, identifier: string): boolean {
  return (
    count(`login-fail:${identifier}`, LOGIN_WINDOW) >= LOGIN_FAIL_MAX ||
    count(`login-fail-ip:${ip}`, LOGIN_WINDOW) >= LOGIN_FAIL_MAX * 2
  );
}

export function recordLoginFailure(ip: string, identifier: string): void {
  incr(`login-fail:${identifier}`, LOGIN_FAIL_MAX, LOGIN_WINDOW);
  incr(`login-fail-ip:${ip}`, LOGIN_FAIL_MAX * 2, LOGIN_WINDOW);
}

export function clearLoginFailures(identifier: string): void {
  clearKey(`login-fail:${identifier}`);
}

export function registerAllowed(ip: string): boolean {
  return count(`register-ip:${ip}`, REGISTER_WINDOW) < REGISTER_MAX;
}

export function recordRegister(ip: string): void {
  incr(`register-ip:${ip}`, REGISTER_MAX, REGISTER_WINDOW);
}
