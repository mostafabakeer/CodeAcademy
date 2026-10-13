/**
 * توليد robots.txt و sitemap.xml في مجلد dist وقت البناء.
 *
 * - جذر الموقع من VITE_SITE_URL (أو SITE_URL).
 * - المسارات الديناميكية (/courses/:id) تُجلب من الـ endpoint العام إن توفّر
 *   SUPABASE_URL. عند غيابه/فشله نكتفي بالمسارات الثابتة (بدون أخطاء بناء).
 *
 * بدون اختراع بيانات: أي طلب فاشل يُتجاهل بصمت ويتحول لمخرجات ثابتة صحيحة.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', 'dist');

const SITE_URL = (process.env.VITE_SITE_URL || process.env.SITE_URL || '').trim().replace(/\/+$/, '');
// الدومين الرسمي الاحتياطي لو لم يُضبط VITE_SITE_URL وقت البناء.
const FALLBACK_BASE = 'https://codeacademy2.drcode.workers.dev';
const BASE = SITE_URL || FALLBACK_BASE;

if (!SITE_URL) {
  console.warn(
    `\n[seo] ⚠ VITE_SITE_URL غير مضبوط — استُخدم الدومين الافتراضي ${FALLBACK_BASE} في robots/sitemap.`,
    '\n      اضبط VITE_SITE_URL عند تغيير الدومين.\n',
  );
}

if (!existsSync(distDir)) {
  console.error('[seo] مجلد dist مفقود — شغّل vite build أولاً.');
  process.exit(1);
}

const staticRoutes = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/courses', changefreq: 'weekly', priority: '0.9' },
  { path: '/top-students', changefreq: 'weekly', priority: '0.7' },
  { path: '/login', changefreq: 'monthly', priority: '0.3' },
  { path: '/register', changefreq: 'monthly', priority: '0.3' },
];

async function fetchCourseRoutes() {
  const supabase = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!supabase) return [];
  try {
    const res = await fetch(`${supabase}/functions/v1/api/public/courses`, {
      headers: { 'x-path': '/public/courses' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.courses) ? data.courses : [];
    return list
      .filter((c) => c && (typeof c.id === 'number' || typeof c.id === 'string'))
      .map((c) => ({ path: `/courses/${c.id}`, changefreq: 'monthly', priority: '0.8' }));
  } catch {
    console.warn('[seo] تعذّر جلب الدورات للـ sitemap — سيقتصر على المسارات الثابتة.');
    return [];
  }
}

const routes = [...staticRoutes, ...(await fetchCourseRoutes())];

const urls = routes
  .map(
    (r) =>
      `  <url>\n    <loc>${BASE}${r.path}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
  )
  .join('\n');

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

const robots =
  `User-agent: *\n` +
  `Allow: /\n\n` +
  `# مسارات خاصة غير مفهرسة\n` +
  `Disallow: /admin\n` +
  `Disallow: /api/\n` +
  `Disallow: /lessons/\n` +
  `Disallow: /exams\n` +
  `Disallow: /notes\n` +
  `Disallow: /codelab\n` +
  `Disallow: /profile\n` +
  `Disallow: /top-students/\n\n` +
  `Sitemap: ${BASE}/sitemap.xml\n`;

writeFileSync(join(distDir, 'sitemap.xml'), sitemap, 'utf8');
writeFileSync(join(distDir, 'robots.txt'), robots, 'utf8');

console.log(`[seo] تم توليد robots.txt + sitemap.xml (${routes.length} رابط) على ${BASE}`);
