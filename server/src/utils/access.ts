export const GRADES = ['bac1', 'bac2', 'all'] as const;

export type ContentGrade = (typeof GRADES)[number];

export function isContentGrade(v: any): v is ContentGrade {
  return GRADES.includes(v);
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
