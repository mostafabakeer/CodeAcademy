import type { ContentGrade } from './types.ts';

export const GRADES: Record<string, { name: string; nameEn: string }> = {
  bac1: { name: 'أولى باكلوريه', nameEn: '1st Baccalaureate' },
  bac2: { name: 'تانية باكلوريه', nameEn: '2nd Baccalaureate' },
};

export const GRADES_LIST: ContentGrade[] = ['bac1', 'bac2', 'all'];

export function isContentGrade(v: unknown): v is ContentGrade {
  return typeof v === 'string' && (GRADES_LIST as string[]).includes(v);
}

/**
 * هل المحتوى (كورس/درس/امتحان/مذكرة) مسموح لطالب بهذه المرحلة؟
 * المحتوى بدون مرحلة أو المرحلة "all" يظهر للجميع.
 */
export function gradeAllowed(contentGrade: string | undefined, studentGrade: string | undefined): boolean {
  if (!contentGrade || contentGrade === 'all') return true;
  if (!studentGrade) return false;
  return contentGrade === studentGrade;
}

/**
 * هل المحتوى مرئي للمستخدم الحالي؟
 * الأدمن يرى كل المحتوى مهما كانت مرحلته، أما الطالب فيخضع لفلتر المرحلة.
 */
export function contentVisible(role: string | undefined, contentGrade: string | undefined, studentGrade: string | undefined): boolean {
  if (role === 'admin') return true;
  return gradeAllowed(contentGrade, studentGrade);
}
