/**
 * حدّ معدل بسيط في الذاكرة (لكل مثيل دالة — كافٍ لكبح الهجمات الأساسية
 * على المصادقة). لا يعتمد على أي خدمة خارجية.
 */

const buckets = new Map<string, { count: number; start: number }>();

function incr(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now - cur.start >= windowMs) {
    buckets.set(key, { count: 1, start: now });
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

export function ipOf(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
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
