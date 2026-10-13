/**
 * بُناة JSON-LD (Schema.org) — تُبنى على بيانات حقيقية فقط.
 * أي حقل غير متوفّر يُحذف تماماً ولا يُقدَّر أو يُخترع.
 *
 * ملاحظة: لا نضيف تقييمات (aggregateRating) أو عروض أسعار (offers) مخترعة.
 */

import { SITE_NAME, SITE_NAME_AR, FOUNDER, CONTACT, SOCIAL_LINKS, absoluteUrl } from './site';

export type JsonLd = Record<string, unknown>;

/** يزيل المفاتيح ذات القيم الفارغة/غير المعرّفة للحفاظ على مخطط نظيف. */
function clean<T extends JsonLd>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === undefined || value === null || value === '') delete obj[key];
    else if (Array.isArray(value) && value.length === 0) delete obj[key];
  }
  return obj;
}

export interface OrganizationInfo {
  /** روابط الحسابات الرسمية (sameAs) — تُحذف لو فاضية. */
  socialLinks?: string[];
  email?: string;
  phone?: string;
  locality?: string;
  region?: string;
  country?: string;
}

export function organizationSchema(info: OrganizationInfo = {}): JsonLd {
  const sameAs = (info.socialLinks ?? []).filter(Boolean);
  const address =
    info.locality || info.region || info.country
      ? clean({
          '@type': 'PostalAddress',
          addressLocality: info.locality,
          addressRegion: info.region,
          addressCountry: info.country,
        })
      : undefined;

  return clean({
    '@type': 'EducationalOrganization',
    '@id': absoluteUrl('/#organization'),
    name: SITE_NAME_AR,
    alternateName: SITE_NAME,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/logo.png'),
    image: absoluteUrl('/login-hero.png'),
    founder: { '@id': absoluteUrl('/#founder') },
    sameAs,
    email: info.email,
    telephone: info.phone,
    address,
  });
}

export interface PersonInfo {
  image?: string;
  sameAs?: string[];
}

export function personSchema(info: PersonInfo = {}): JsonLd {
  return clean({
    '@type': 'Person',
    '@id': absoluteUrl('/#founder'),
    name: FOUNDER.nameAr,
    alternateName: FOUNDER.name,
    jobTitle: FOUNDER.roleAr,
    image: info.image ? absoluteUrl(info.image) : absoluteUrl('/owner.png'),
    worksFor: { '@id': absoluteUrl('/#organization') },
    sameAs: (info.sameAs ?? []).filter(Boolean),
  });
}

export function websiteSchema(): JsonLd {
  return clean({
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: SITE_NAME_AR,
    alternateName: SITE_NAME,
    url: absoluteUrl('/'),
    inLanguage: 'ar',
    publisher: { '@id': absoluteUrl('/#organization') },
  });
}

/** المخطط الأساسي للصفحة الرئيسية: WebSite + Organization + Person في رسم واحد. */
export function siteGraph(info: OrganizationInfo & PersonInfo = {}): JsonLd {
  // القيم الافتراضية من بيانات المشروع الحقيقية (site.ts) — يمكن تجاوز أي منها صراحةً.
  const merged: OrganizationInfo & PersonInfo = {
    socialLinks: [...SOCIAL_LINKS],
    sameAs: [...SOCIAL_LINKS],
    email: CONTACT.email,
    phone: CONTACT.phone,
    locality: CONTACT.cityAr,
    region: CONTACT.regionAr,
    country: CONTACT.country,
    ...info,
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      websiteSchema(),
      organizationSchema(merged),
      personSchema({ image: merged.image, sameAs: merged.sameAs }),
    ],
  };
}

export interface CourseSchemaInput {
  id: number | string;
  name: string;
  description?: string;
  image?: string;
  lessonsCount?: number;
}

export function courseSchema(input: CourseSchemaInput): JsonLd {
  return clean({
    '@type': 'Course',
    '@id': absoluteUrl(`/courses/${input.id}#course`),
    name: input.name,
    description: input.description,
    url: absoluteUrl(`/courses/${input.id}`),
    image: input.image ? absoluteUrl(input.image) : undefined,
    inLanguage: 'ar',
    provider: { '@id': absoluteUrl('/#organization') },
    numberOfCredits: input.lessonsCount,
  });
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function courseListSchema(courses: CourseSchemaInput[]): JsonLd {
  return clean({
    '@type': 'ItemList',
    numberOfItems: courses.length,
    itemListElement: courses.map((c, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/courses/${c.id}`),
      name: c.name,
    })),
  });
}

/** يلفّ عدة مخططات في مستند واحد مع @context. */
export function graph(parts: JsonLd[]): JsonLd {
  return { '@context': 'https://schema.org', '@graph': parts.filter(Boolean) };
}
