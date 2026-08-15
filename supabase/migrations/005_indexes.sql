-- ============ تحسين سرعة لوحة الطلبة (بحث + فلاتر) ============

-- بحث ILIKE بالاسم/التليفون/اسم المستخدم يستفيد من فهرس trigram
create extension if not exists pg_trgm;

create index if not exists idx_users_full_name_trgm on public.users using gin (full_name gin_trgm_ops);
create index if not exists idx_users_phone_trgm on public.users using gin (phone gin_trgm_ops);
create index if not exists idx_users_username_trgm on public.users using gin (username gin_trgm_ops);

-- فلاتر لوحة الأدمن
create index if not exists idx_users_grade on public.users(grade);
create index if not exists idx_users_role_subscription on public.users(role, subscription);
create index if not exists idx_users_blocked on public.users(blocked);

-- فلترة محتوى حسب المرحلة
create index if not exists idx_lessons_grade on public.lessons(grade);
create index if not exists idx_exams_grade on public.exams(grade);
