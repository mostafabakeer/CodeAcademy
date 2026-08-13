/** متغيرات البيئة المخصصة — تُضبط من Supabase Dashboard → Edge Functions Secrets. */

export function env(name: string, fallback = ''): string {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : fallback;
}

export const JWT_SECRET = env('JWT_SECRET', 'dev-only-change-me');
/** فاصلة مفصولة من أصول الواجهة المسموحة (فراغ = السماح للجميع مع عكس الأصل). */
export const CORS_ORIGIN = env('CORS_ORIGIN');
export const BUCKET_VIDEOS = env('BUCKET_VIDEOS', 'videos');
export const BUCKET_IMAGES = env('BUCKET_IMAGES', 'images');
export const BUCKET_BACKUPS = env('BUCKET_BACKUPS', 'backups');

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
