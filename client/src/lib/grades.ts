/**
 * الصفوف الدراسية — مصدر واحد للقائمة والأسماء والألوان.
 * أي صف جديد يُضاف هنا فقط، وكل الواجهة تقرأ منه.
 */
export const GRADE_KEYS = ['bac1', 'bac2', 'cs'] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];

/** لون بطاقة «أوائل آخر امتحان» لكل صف. */
export type GradeAccent = 'sky' | 'ember' | 'violet';

/** مفتاح ترجمة اسم الصف. */
export const GRADE_LABEL_KEY: Record<GradeKey, string> = {
  bac1: 'auth.bac1',
  bac2: 'auth.bac2',
  cs: 'auth.cs',
};

export const GRADE_ACCENT: Record<GradeKey, GradeAccent> = {
  bac1: 'sky',
  bac2: 'ember',
  cs: 'violet',
};

export function isGradeKey(value: unknown): value is GradeKey {
  return typeof value === 'string' && (GRADE_KEYS as readonly string[]).includes(value);
}

/**
 * مفتاح ترجمة أي قيمة صف — بما فيها 'all' أو قيمة غير معروفة.
 * تُستخدم بدل التعبيرات الثنائية (bac1 ? … : bac2) التي كانت تعرض
 * أي صف جديد باسم «تانية باكلوريه».
 */
export function gradeLabelKey(grade: string | undefined | null): string {
  if (!grade || grade === 'all') return 'admin.gradeAll';
  return GRADE_LABEL_KEY[grade as GradeKey] ?? grade;
}
