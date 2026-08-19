import * as jose from 'npm:jose@^5.9.6';
import type { Context, Next } from 'npm:hono@^4.6.3';
import { JWT_SECRET } from './env.ts';
import { findAuthUserById, getSessionEpoch, type DbUser } from './db.ts';

export const AUTH_COOKIE = 'dr_code_token';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 يوم

export interface AuthUser {
  id: number;
  role: 'student' | 'admin';
  fullName: string;
  phone: string;
  grade: string;
  blocked?: boolean;
  subscription?: boolean;
}

const encoder = new TextEncoder();
const key = encoder.encode(JWT_SECRET);

const userCache = new Map<number, { user: AuthUser; at: number }>();
const USER_CACHE_TTL = 30_000;

function getCachedUser(id: number): AuthUser | null {
  const entry = userCache.get(id);
  if (entry && Date.now() - entry.at < USER_CACHE_TTL) return entry.user;
  userCache.delete(id);
  return null;
}

function setCachedUser(user: AuthUser): void {
  if (userCache.size > 500) userCache.clear();
  userCache.set(user.id, { user, at: Date.now() });
}

export function invalidateUserCache(userId: number): void {
  userCache.delete(userId);
}

/** نفس تنسيق التوكن القديم (jsonwebtoken HS256) حتى تبقى الجلسات سارية بعد الترحيل. */
export async function signToken(user: Pick<AuthUser, 'id' | 'role' | 'fullName' | 'phone' | 'grade'>): Promise<string> {
  return await new jose.SignJWT({
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    phone: user.phone,
    grade: user.grade,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key);
}

type DecodedToken = AuthUser & { iat?: number };

function verifyToken(token: string): Promise<DecodedToken | null> {
  return jose
    .jwtVerify(token, key)
    .then(({ payload }) => ({
      id: Number(payload.id),
      role: payload.role === 'admin' ? 'admin' as const : 'student' as const,
      fullName: String(payload.fullName ?? ''),
      phone: String(payload.phone ?? ''),
      grade: String(payload.grade ?? ''),
      iat: typeof payload.iat === 'number' ? payload.iat : undefined,
    }))
    .catch(() => null);
}

/** يقرأ Cookie باسم معيّن من هيدر الطلب. */
export function parseCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return rest.join('=');
      }
    }
  }
  return null;
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (h && h.startsWith('Bearer ')) {
    const v = h.slice(7).trim();
    return v || null;
  }
  return null;
}

/**
 * المصادقة عبر Authorization: Bearer أو الـ Cookie (dr_code_token).
 * يُستعمل الـ Bearer فقط إذا فكّ تشفيره لمستخدم حقيقي في القاعدة؛ وإلا يقع
 * الرجوع إلى الـ Cookie (يحمي من إرسال المكتبة مفتاح anon كـ Bearer افتراضياً).
 * يعيد المستخدم الطازج من قاعدة البيانات (فحص الحظر/الاشتراك فورياً).
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const bearer = bearerToken(req);
  if (bearer) {
    const user = await resolveUser(bearer);
    if (user) return user;
  }

  const cookie = parseCookie(req, AUTH_COOKIE);
  if (cookie) {
    const user = await resolveUser(cookie);
    if (user) return user;
  }

  return null;
}

async function resolveUser(token: string): Promise<AuthUser | null> {
  const decoded = await verifyToken(token);
  if (!decoded) return null;

  try {
    const epoch = await getSessionEpoch();
    if (epoch > 0 && (!decoded.iat || decoded.iat * 1000 < epoch)) return null;

    const cached = getCachedUser(decoded.id);
    if (cached) return cached;

    const user: DbUser | null = await findAuthUserById(decoded.id);
    if (!user) return null;

    const authUser: AuthUser = {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      phone: user.phone,
      grade: user.grade ?? decoded.grade,
      blocked: !!user.blocked,
      subscription: !!user.subscription,
    };
    setCachedUser(authUser);
    return authUser;
  } catch (e) {
    console.error('[auth] resolveUser:', (e as Error).message);
    return null;
  }
}

export function authCookieHeader(token: string): string {
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${AUTH_COOKIE_MAX_AGE}`;
}

export function clearAuthCookieHeader(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

/* =================== وسائط Hono =================== */

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const user = await getAuthUser(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.blocked) return c.json({ error: 'تم حظر حسابك من قبل إدارة الموقع' }, 403);
  c.set('user', user);
  await next();
}

export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return c.json({ error: 'Forbidden: admin only' }, 403);
  await next();
}

/** يمنع الطالب غير المشترك من الوصول إلى المحتوى. الأدمن دائماً مسموح. */
export async function requireSubscriber(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role === 'admin') { await next(); return; }
  if (!user.subscription) {
    return c.json({ error: 'يجب تفعيل اشتراكك للوصول إلى المحتوى. تواصل مع إدارة الموقع واتساب: 01068633486' }, 403);
  }
  await next();
}
