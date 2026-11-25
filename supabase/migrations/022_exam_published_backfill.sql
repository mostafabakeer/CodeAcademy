-- 022: ترتيب الامتحانات بتاريخ الرفع.
--
-- 1) تعبئة `published_at` للامتحانات القديمة من `created_at` (بالمللي ثانية)
--    حتى يكون لكل امتحان تاريخ نشر صالح بدل null.
-- 2) فهرس تنازلي على `created_at` يخدم ترتيب "الأحدث أولاً" في قائمة الطلاب
--    والأدمن دون فرز في الذاكرة.
-- الملف آمن لإعادة التنفيذ.

update public.exams
set published_at = to_timestamp(created_at / 1000.0)
where published_at is null
  and coalesce(created_at, 0) > 0;

-- الامتحانات المخفية تبقى بلا تاريخ نشر حتى تُنشر فعلاً.
update public.exams
set published_at = null
where is_hidden = true;

create index if not exists idx_exams_created_at_desc
  on public.exams (created_at desc, id desc);

create index if not exists idx_exams_grade_created_at
  on public.exams (grade, created_at desc)
  where is_hidden = false;
