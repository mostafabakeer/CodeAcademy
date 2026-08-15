/** متغيرات البيئة المخصصة — تُضبط من Supabase Dashboard → Edge Functions Secrets. */

export function env(name: string, fallback = ''): string {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : fallback;
}

const FALLBACK_JWT = 'dev-only-change-me';
const jwtSecretRaw = env('JWT_SECRET');
if (!jwtSecretRaw || jwtSecretRaw === FALLBACK_JWT) {
  throw new Error(
    'JWT_SECRET غير مضبوط (أو ما زال القيمة الافتراضية). الدوال ترفض التشغيل حمايةً للبيانات. ' +
      'اضبطه أولاً: supabase secrets set JWT_SECRET=<سلسلة عشوائية طويلة>  ثم نفّذ في الداشبورد: Edge Functions → Secrets → JWT_SECRET. ' +
      'ملاحظة: استخدم نفس القيمة في كل البيئات (محلي + سحابة).'
  );
}
export const JWT_SECRET = jwtSecretRaw;
/** فاصلة مفصولة من أصول الواجهة المسموحة (فراغ = لا أصل متصفح مسموح، فقط خوادم/أدوات بلا Origin). */
export const CORS_ORIGIN = env('CORS_ORIGIN');
export const BUCKET_VIDEOS = env('BUCKET_VIDEOS', 'videos');
export const BUCKET_IMAGES = env('BUCKET_IMAGES', 'images');
export const BUCKET_BACKUPS = env('BUCKET_BACKUPS', 'backups');
/** رقم تليفون حساب المدير الرئيسي (يُقارن بعد توحيد الصيغة في التسجيل).
 *  غيابه يعني ألا يصبح أي مسجّل جديد admin تلقائياً (سلوك آمن افتراضياً). */
export const ADMIN_PHONE = env('ADMIN_PHONE');

export function supabaseUrl(): string {
  return env('SUPABASE_URL');
}

export function serviceRoleKey(): string {
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

export function projectRef(): string {
  const url = supabaseUrl();
  try {
    const host = new URL(url).hostname;
    return host.split('.')[0] ?? '';
  } catch {
    return '';
  }
}
