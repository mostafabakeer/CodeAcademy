/**
 * تنسيق المدد الزمنية — مصدر واحد لكل مكان يعرض وقتاً.
 *
 * كان `LessonListItem` يعرض "12:30 ثانية": الدالة القديمة تُرجع mm:ss ثم
 * تُلحق بها كلمة "ثانية" دائماً. نفصل هنا بين صيغتين:
 * - `formatClock`: صيغة رقمية للمقارنة (شاهدت 12:30 من 20:00).
 * - `formatDurationLabel`: مدة مقروءة بالوحدة الصحيحة (45 ثانية / 13 دقيقة / ساعة و5 دقائق).
 */

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** مدة بصيغة ساعة رقمية: 45 → 0:45 · 750 → 12:30 · 3750 → 1:02:30 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** مدة بالوحدة الصحيحة: أقل من دقيقة ⇒ ثانية، أقل من ساعة ⇒ دقيقة، وإلا ساعة/دقائق. */
export function formatDurationLabel(totalSeconds: number, t: Translate): string {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (s < 60) return `${s} ${t('time.second')}`;
  if (s < 3600) return `${Math.round(s / 60)} ${t('time.minute')}`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h} ${t('time.hour')} ${m} ${t('time.minute')}` : `${h} ${t('time.hour')}`;
}

/** «شاهدت 12:30 من 20:00» — جملة موحّدة لكل الصفحات. */
export function watchedOf(watchedSeconds: number, durationSeconds: number, t: Translate): string {
  return t('time.watchedOf', {
    watched: formatClock(watchedSeconds),
    total: formatClock(durationSeconds),
  });
}
