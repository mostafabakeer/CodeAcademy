/**
 * مصدر واحد لبيانات الهوية والدومين المستخدمة في SEO.
 *
 * الدومين الرسمي يُضبط عبر `VITE_SITE_URL` (بدون شرطة نهائية).
 * في غيابه نستخدم `window.location.origin` وقت التشغيل. أما وقت البناء
 * (sitemap/prerender) فلا يوجد window، لذلك يجب ضبط `VITE_SITE_URL` هناك.
 */

export const SITE_NAME = 'DR Code';
export const SITE_NAME_AR = 'دكتور كود';

/** العلامة المفضّلة للعناوين (العربية أولاً لصالح فهرسة «دكتور كود»). */
export const BRAND_FULL = `${SITE_NAME_AR} | ${SITE_NAME}`;

export const FOUNDER = {
  name: 'Mostafa Bakeer',
  nameAr: 'مصطفى بكير',
  roleAr: 'مؤسس ومدرب الموقع',
  roleEn: 'Founder & Instructor',
} as const;

/** بيانات التواصل الحقيقية — تُستخدم في Schema.org فقط. */
export const CONTACT = {
  email: 'mostafabakeera@gmail.com',
  phone: '+201068633486',
  phoneDisplay: '01068633486',
  cityAr: 'مغاغة',
  cityEn: 'Maghagha',
  regionAr: 'المنيا',
  regionEn: 'Minya',
  country: 'EG',
} as const;

/** الحسابات الرسمية (sameAs) — بصيغتها القابلة للثبات. */
export const SOCIAL_LINKS = [
  'https://www.tiktok.com/@drcode2002',
  'https://youtube.com/@drcode-k6n',
  'https://www.facebook.com/share/1E5yh1LbEe/',
] as const;

export const DEFAULT_TITLE = `${SITE_NAME_AR} ${SITE_NAME} | تعلّم البرمجة`;
export const DEFAULT_DESCRIPTION =
  'دكتور كود (DR Code) — منصة تعليم البرمجة لطلاب المرحلة الثانوية في مصر مع مدرب البرمجة مصطفى بكير: دورات منظّمة، امتحانات تفاعلية، ومذكرات وملخصات بالعربي.';

/** الدومين الرسمي الاحتياطي لو لم يُضبط VITE_SITE_URL وقت البناء. */
export const FALLBACK_SITE_URL = 'https://codeacademy2.drcode.workers.dev';

export const SITE_URL = String(import.meta.env.VITE_SITE_URL ?? FALLBACK_SITE_URL)
  .trim()
  .replace(/\/+$/, '');

/** جذر الموقع: الدومين المضبوط أو أصل الصفحة الحالية وقت التشغيل. */
export function siteBase(): string {
  if (SITE_URL) return SITE_URL;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

/** يحوّل مساراً نسبياً إلى رابط مطلق باستخدام جذر الموقع. */
export function absoluteUrl(path = '/'): string {
  const base = siteBase();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${suffix}` : suffix;
}

/** صورة Open Graph افتراضية (مطلقة) لاستخدامها عند غياب صورة مخصّصة. */
export const DEFAULT_OG_IMAGE = absoluteUrl('/login-hero.png');
