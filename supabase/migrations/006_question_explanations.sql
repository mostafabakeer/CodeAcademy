-- ============ شرح (تعليل) الأسئلة ============
-- يضيف عمودين إلى جدول الأسئلة: شرح/تعليل بالعربي والإنجليزي على مستوى السؤال.
-- الآمنة لإعادة التنفيذ: add column if not exists.

alter table public.questions
  add column if not exists explanation text not null default '',
  add column if not exists explanation_en text not null default '';
