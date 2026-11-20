-- Add is_hidden and published_at columns to exams table
-- is_hidden: يحدد إذا كان الامتحان مخفياً عن الطلاب (デフォルト: false)
-- published_at: وقت نشر الامتحان (متى أصبح visibles للطلاب)

alter table public.exams
  add column if not exists is_hidden boolean not null default false,
  add column if not exists published_at timestamp with time zone;

-- فهرس لتحسين عمليات الفلترة حسب حالة الإخفاء والمرحلة
create index if not exists idx_exams_hidden_grade
on public.exams(is_hidden, grade);

-- فهرس للبحث حسب وقت النشر
create index if not exists idx_exams_published_at
on public.exams(published_at desc);