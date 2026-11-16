-- ============ Batch 2: تجميع التقارير الثقيلة داخل القاعدة + فهارس ناقصة ============
-- الهدف: بدل نقل آلاف الصفوف إلى Edge Function وتجميعها في JavaScript،
-- ترجع الدالة الصفوف النهائية فقط (≤ 90 صفاً للوحات، صف واحد للترتيب).
-- كل الدوال SECURITY INVOKER + service_role فقط (نفس نمط 014).

-- أوائل 3 لكل امتحان، الأحدث أولاً، مع فلترة المرحلة واستبعاد الأدمن.
create or replace function public.exam_top3_leaderboards(p_limit integer default 30)
returns table (
  exam_id bigint,
  exam_title text,
  exam_title_en text,
  exam_grade text,
  user_id bigint,
  full_name text,
  score integer
)
language sql
stable
set search_path = public
as $$
  with recent as (
    select e.id, e.title, e.title_en, e.grade, e.created_at
    from public.exams e
    order by e.created_at desc, e.id desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  ),
  ranked as (
    select r.exam_id,
           e.title as exam_title,
           e.title_en as exam_title_en,
           e.grade as exam_grade,
           r.user_id,
           u.full_name,
           r.best as score,
           e.created_at,
           row_number() over (partition by r.exam_id order by r.best desc, r.user_id asc) as rn
    from public.exam_results r
    join recent e on e.id = r.exam_id
    join public.users u on u.id = r.user_id
    where u.role <> 'admin'
      and (e.grade = 'all' or u.grade = e.grade)
  )
  select exam_id, exam_title, exam_title_en, exam_grade, user_id, full_name, score
  from ranked
  where rn <= 3
  order by created_at desc, exam_id desc, rn;
$$;

-- ترتيب الطالب الحقيقي في آخر امتحان مناسب لمرحلته — صف واحد.
create or replace function public.latest_exam_rank(p_user_id bigint, p_grade text)
returns table (
  exam_id bigint,
  exam_title text,
  exam_title_en text,
  score integer,
  rank bigint,
  total bigint,
  taken boolean
)
language sql
stable
set search_path = public
as $$
  with chosen as (
    select e.id, e.title, e.title_en, e.grade
    from public.exams e
    where e.grade = 'all' or e.grade = p_grade
    order by e.created_at desc, e.id desc
    limit 1
  ),
  ranked as (
    select r.user_id,
           r.best,
           row_number() over (order by r.best desc, r.user_id asc) as rn
    from public.exam_results r
    join chosen e on e.id = r.exam_id
    join public.users u on u.id = r.user_id
    where u.role <> 'admin'
      and (e.grade = 'all' or u.grade = e.grade)
  )
  select e.id as exam_id,
         e.title as exam_title,
         e.title_en as exam_title_en,
         mine.best as score,
         mine.rn as rank,
         (select count(*) from ranked) as total,
         (mine.user_id is not null) as taken
  from chosen e
  left join ranked mine on mine.user_id = p_user_id;
$$;

-- إحصائيات لوحة الأدمن: 8 استعلامات count منفصلة ⇒ استعلام واحد.
create or replace function public.admin_dashboard_stats()
returns table (
  students bigint,
  admins bigint,
  subscribed bigint,
  courses bigint,
  lessons bigint,
  exams bigint,
  notes bigint,
  code_files bigint
)
language sql
stable
set search_path = public
as $$
  select
    (select count(*) from public.users where role = 'student'),
    (select count(*) from public.users where role = 'admin'),
    (select count(*) from public.users where role = 'student' and subscription = true),
    (select count(*) from public.courses),
    (select count(*) from public.lessons),
    (select count(*) from public.exams),
    (select count(*) from public.notes),
    (select count(*) from public.code_files);
$$;

-- تشخيص طلبات كلمة السر: عدّ التصنيفات + آخر طلب + عداد اليوم غير المطابق.
create or replace function public.password_reset_diagnostics(p_unmatched_key text default null)
returns table (
  total bigint,
  by_status jsonb,
  last_request_at bigint,
  today_unmatched bigint
)
language sql
stable
set search_path = public
as $$
  with grouped as (
    select coalesce(status, 'pending') as status, count(*)::bigint as c
    from public.password_resets
    group by 1
  ),
  agg as (
    select coalesce(sum(c), 0)::bigint as total,
           coalesce(jsonb_object_agg(status, c), '{}'::jsonb) as by_status
    from grouped
  )
  select a.total,
         a.by_status,
         (select max(created_at) from public.password_resets) as last_request_at,
         coalesce(
           (
             select case
                      when jsonb_typeof(value) = 'number' then (value #>> '{}')::bigint
                      else 0
                    end
             from public.app_config
             where key = p_unmatched_key
             limit 1
           ),
           0
         ) as today_unmatched
  from agg a;
$$;

-- فهارس ناقصة اكتُشفت من الاستعلامات الفعلية
-- دخول باسم المستخدم (بحث تساوٍ، لا trigram)
create index if not exists idx_users_username on public.users(username);
-- فلترة الملازم حسب المرحلة (bootstrap/notes)
create index if not exists idx_notes_grade on public.notes(grade);
-- أحدث امتحان لكل مرحلة + لوحة الأوائل
create index if not exists idx_exams_created_id on public.exams(created_at desc, id desc);
-- ترتيب داخل امتحان مع كسر التعادل بـ user_id (يطابق ORDER BY في RPC)
create index if not exists idx_exam_results_exam_best_user on public.exam_results(exam_id, best desc, user_id);
-- تشخيص طلبات كلمة السر
create index if not exists idx_password_resets_status on public.password_resets(status);
create index if not exists idx_password_resets_created on public.password_resets(created_at desc);

revoke all on function public.exam_top3_leaderboards(integer) from public, anon, authenticated;
revoke all on function public.latest_exam_rank(bigint, text) from public, anon, authenticated;
revoke all on function public.admin_dashboard_stats() from public, anon, authenticated;
revoke all on function public.password_reset_diagnostics(text) from public, anon, authenticated;

grant execute on function public.exam_top3_leaderboards(integer) to service_role;
grant execute on function public.latest_exam_rank(bigint, text) to service_role;
grant execute on function public.admin_dashboard_stats() to service_role;
grant execute on function public.password_reset_diagnostics(text) to service_role;
