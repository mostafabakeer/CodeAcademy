/**
 * نسخة احتياطية من توكن الجلسة في localStorage.
 *
 * الجلسة الأساسية تبقى كوكي HttpOnly (`dr_code_token`) لا يستطيع JS قراءته.
 * لكن بعض المتصفحات (Safari/iOS مع ITP، وضع التصفح الخاص، مسح بيانات الموقع)
 * قد تُسقط الكوكي فجأة، فيُطرد المستخدم رغم أنه لم يسجّل خروجاً. لذلك نحفظ
 * نسخة من التوكن هنا ونرسلها كـ `Authorization: Bearer` عند وجودها:
 *   - على كل جهاز/متصفح: الكوكي أولاً + Bearer احتياطي.
 *   - لو ضاع الكوكي: الطلب ينجح بالـ Bearer ويجدّد الخادم الكوكي تلقائياً.
 *
 * تخفيف المخاطر (لأن localStorage مقروء لأي XSS):
 *   - التوكن يُمسح تلقائياً عند انتهاء صلاحيته (exp) وقبلها بدقيقة.
 *   - `token_version` في الخادم يسمح بإبطال كل التوكنات فوراً ("خروج من كل الأجهزة").
 *   - الموقع يمنع HTML خام من المستخدم (react-markdown بلا rehype-raw) + CSP صارم.
 */

const TOKEN_KEY = 'dr_code_token_v1';

/** مفتاح التخزين — يُستخدم لمراقبة تغيّره بين التبويبات. */
export const SESSION_TOKEN_KEY = TOKEN_KEY;

interface StoredToken {
  v: 1;
  token: string;
  /** انتهاء الصلاحية بالثواني (من JWT)، 0 إذا تعذّر قراءته. */
  exp: number;
  savedAt: number;
}

/** هامش أمان: لا نستخدم توكن قارب على الانتهاء. */
const EXPIRY_SKEW_MS = 60_000;

function decodeExp(token: string): number {
  try {
    const part = token.split('.')[1];
    if (!part) return 0;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

/** التوكن المخزّن إن كان موجوداً وصالحاً، وإلا null (ويمسح المنتهي). */
export function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as StoredToken;
    if (!rec || rec.v !== 1 || typeof rec.token !== 'string' || !rec.token) return null;
    const expMs = typeof rec.exp === 'number' ? rec.exp * 1000 : 0;
    if (expMs && expMs - EXPIRY_SKEW_MS <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return rec.token;
  } catch {
    return null;
  }
}

/** يحفظ توكناً جديداً (يتجاهل القيمة الفارغة حتى لا يمسح جلسة صالحة بالخطأ). */
export function writeStoredToken(token: unknown): void {
  if (typeof token !== 'string' || !token) return;
  try {
    const rec: StoredToken = { v: 1, token, exp: decodeExp(token), savedAt: Date.now() };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(rec));
  } catch {
    /* التخزين ممتلئ/محظور — الجلسة تبقى على الكوكي */
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function hasStoredToken(): boolean {
  return readStoredToken() !== null;
}
