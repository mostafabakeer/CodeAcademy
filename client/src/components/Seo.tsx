import { useEffect } from 'react';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  SITE_NAME_AR,
  BRAND_FULL,
  absoluteUrl,
} from '../lib/seo/site';
import type { JsonLd } from '../lib/seo/schema';

export interface SeoProps {
  /** عنوان الصفحة (دون اسم الموقع — يُضاف تلقائياً). */
  title?: string;
  description?: string;
  /** مسار الصفحة المطلق داخل الموقع، مثل `/courses`. */
  path: string;
  /** صورة المشاركة (مسار أو رابط مطلق). */
  image?: string;
  noindex?: boolean;
  type?: 'website' | 'article';
  jsonLd?: JsonLd | JsonLd[] | null;
}

/** يبني عنواناً كاملاً مع اسم الموقع دون تكراره (العربية أولاً لصالح «دكتور كود»). */
function fullTitle(title?: string): string {
  if (!title) return DEFAULT_TITLE;
  const trimmed = title.trim();
  if (!trimmed) return DEFAULT_TITLE;
  if (trimmed.includes(SITE_NAME_AR) || trimmed.includes(SITE_NAME)) return trimmed;
  return `${trimmed} | ${SITE_NAME_AR}`;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute('data-seo', '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('data-seo', '1');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** كل العناصر التي يديرها هذا المكوّن تحمل data-seo، فنزيلها قبل كل تطبيق. */
function clearManaged(): void {
  document.head.querySelectorAll('[data-seo="1"]').forEach((node) => node.remove());
}

/**
 * مكوّن SEO: يضبط title/description/canonical/OG/Twitter/robots/JSON-LD
 * بشكل حتمي عبر تأثيرات DOM (يعمل بعد الـ mount، فتعمل معه خطوة الـ prerender).
 */
export function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image,
  noindex = false,
  type = 'website',
  jsonLd = null,
}: SeoProps) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    clearManaged();

    const canonical = absoluteUrl(path);
    const imageUrl = image ? (image.startsWith('http') ? image : absoluteUrl(image)) : DEFAULT_OG_IMAGE;
    const resolvedTitle = fullTitle(title);

    document.title = resolvedTitle;
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';

    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', resolvedTitle);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', imageUrl);

    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', BRAND_FULL);
    upsertMeta('property', 'og:locale', 'ar_EG');
    upsertMeta('property', 'og:locale:alternate', 'en_US');
    upsertMeta('property', 'og:title', resolvedTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', imageUrl);

    upsertLink('canonical', canonical);

    if (jsonLd) {
      const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      blocks.forEach((block, index) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-seo', '1');
        script.setAttribute('data-seo-index', String(index));
        script.textContent = JSON.stringify(block);
        document.head.appendChild(script);
      });
    }

    return () => {
      clearManaged();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jsonLdKey يمثّل jsonLd نصياً
  }, [title, description, path, image, noindex, type, jsonLdKey]);

  return null;
}

export default Seo;
