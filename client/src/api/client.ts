import { SUPABASE_URL } from '../config';

const TOKEN_KEY = 'dr_code_token';
const LOGGED_OUT_KEY = 'dr_code_logged_out';
const AUTH_FAIL_KEY = 'dr_code_lastAuthFail';
let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/* =================== علامة "تمّ تسجيل الخروج" (لأولئك الذين يعتمدون على الكوكي فقط) ===================
 * الكوكي HttpOnly لا يمكن مسحه من الجافاسكربت. عند الخروج نضع علمًا يمنع
 * البوت من إعادة تنشيط جلسة عبر الكوكي بعد إعادة التحميل، ونمسحه عند الدخول مجددًا. */

export function markLoggedOut(): void {
  try {
    localStorage.setItem(LOGGED_OUT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearLoggedOutFlag(): void {
  try {
    localStorage.removeItem(LOGGED_OUT_KEY);
  } catch {
    /* ignore */
  }
}

export function getLoggedOutFlag(): boolean {
  try {
    return localStorage.getItem(LOGGED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/* =================== تشخيص الجلسات =================== */

interface TokenPayload {
  iat?: number;
  exp?: number;
}

export interface AuthFailRecord {
  at: number;
  status: number;
  reason: string;
}

/** فك جزء payload من JWT بدون مكتبات (قراءة iat/exp فقط للتشخيص). */
function decodeJwtPayload<T = TokenPayload>(token: string): T | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** يسجّل سبب فشل المصادقة الحقيقي لقراءته لاحقاً في صفحة الدخول (بدل التخمين). */
export function recordAuthFailure(status: number, token: string | null): void {
  let reason = 'unknown';
  if (status === 401 && token) {
    const payload = decodeJwtPayload(token);
    if (payload?.exp && payload.exp * 1000 < Date.now()) reason = 'expired';
    else if (payload) reason = 'invalid';
    else reason = 'malformed';
  } else if (status === 401) {
    reason = 'no-token';
  } else if (status === 403) {
    reason = 'blocked';
  } else if (status === 404) {
    reason = 'missing-user';
  } else if (status === 0) {
    reason = 'network';
  } else if (status >= 500) {
    reason = 'server';
  }
  try {
    localStorage.setItem(AUTH_FAIL_KEY, JSON.stringify({ at: Date.now(), status, reason }));
  } catch {
    /* ignore */
  }
}

/** التشخيص صالح لـ 10 دقائق فقط — لا تعرض رسالة قديمة على صفحة الدخول لاحقًا. */
const AUTH_FAIL_TTL = 10 * 60_000;

export function getLastAuthFail(): AuthFailRecord | null {
  try {
    const raw = localStorage.getItem(AUTH_FAIL_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as AuthFailRecord;
    if (!rec || typeof rec.at !== 'number' || Date.now() - rec.at > AUTH_FAIL_TTL) return null;
    return rec;
  } catch {
    return null;
  }
}

export function clearAuthFail(): void {
  try {
    localStorage.removeItem(AUTH_FAIL_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

type InvokeBody = File | Blob | ArrayBuffer | FormData | ReadableStream<Uint8Array> | Record<string, any> | string;

function normalizeBody(body: unknown): InvokeBody {
  if (typeof body === 'string') {
    const t = body.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return JSON.parse(t);
      } catch {
        /* keep raw string */
      }
    }
  }
  return body as InvokeBody;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const parsed = (await res.json()) as { error?: string; detail?: string };
    if (parsed?.detail) return `${parsed.error}: ${parsed.detail}`;
    if (parsed?.error) return parsed.error;
  } catch {
    /* ignore */
  }
  return res.status >= 500 ? 'تعذر الاتصال بالخادم، حاول مجدداً' : `Request failed (${res.status})`;
}

/** مهلة موحدة للطلبات — تمنع سبينرًا أبديًا عند انقطاع صامت. */
const REQUEST_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers } = options;
  const route = path.startsWith('/api') ? path.slice(4) || '/' : path || '/';

  const requestHeaders: Record<string, string> = { 'x-path': route, ...headers };
  const token = getToken();
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    const normalized = normalizeBody(body);
    if (typeof normalized === 'string') {
      payload = normalized;
    } else if (normalized instanceof Blob || normalized instanceof FormData || normalized instanceof ArrayBuffer) {
      payload = normalized;
    } else {
      requestHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(normalized);
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/api`, {
      method,
      headers: requestHeaders,
      credentials: 'include',
      body: payload,
      // AbortController.signal يُضاف داخليًا في fetchWithTimeout
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('انتهت مهلة الاتصال بالخادم، حاول مجدداً', 0);
    }
    throw new ApiError('تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت ثم حاول مجدداً', 0);
  }

  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    // استجابة 200 بغير JSON (صفحة HTML من CDN/بروكسي) لا تعني نجاحًا.
    throw new ApiError('الخادم أعاد استجابة غير صالحة', 502);
  }
}
