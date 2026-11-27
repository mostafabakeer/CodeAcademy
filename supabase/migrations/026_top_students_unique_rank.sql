-- =================== إضافة Unique Constraint للـ top_students ===================
-- يمنع تكرار نفس الترتيب في نفس الصف الدراسي

-- 1. إنشاء unique index على (grade, rank) - هذا يفرض الـ uniqueness تلقائياً
create unique index if not exists uq_top_students_grade_rank
on public.top_students (grade, rank);

-- 2. فهرس عادي للأداء (الترتيب والفلترة)
create index if not exists idx_top_students_grade_rank
on public.top_students (grade, rank);

-- 3. فهرس للترتيب التنازلي حسب تاريخ الإنشاء
create index if not exists idx_top_students_created_at
on public.top_students (created_at desc);