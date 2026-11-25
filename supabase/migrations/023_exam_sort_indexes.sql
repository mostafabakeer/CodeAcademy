-- =================== فهارس وترتيب الامتحانات ===================

-- فهرس للترتيب التنازلي حسب تاريخ الإنشاء (الأحدث أولاً)
create index if not exists idx_exams_created_at_desc
on public.exams (created_at desc, id desc);

-- فهرس مركب للفلترة والترتيب للمراحل
create index if not exists idx_exams_grade_created_at
on public.exams (grade, created_at desc)
where is_hidden = false;

-- تعبئة published_at للامتحانات القديمة من created_at
update public.exams
set published_at = to_timestamp(created_at / 1000.0)
where published_at is null
  and coalesce(created_at, 0) > 0;

-- الامتحانات المخفية تبقى بلا تاريخ نشر
update public.exams
set published_at = null
where is_hidden = true;