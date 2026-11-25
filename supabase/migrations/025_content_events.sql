-- =================== جدول أحداث المحتوى ===================
-- سجل أحداث المحتوى (لا يحتوي أي بيانات شخصية)
-- يستخدم للمزامنة بين التبويبات واستخدام Realtime مستقبلاً
create table if not exists public.content_events (
  id bigserial primary key,
  kind text not null,          -- insert/update/delete
  entity text not null,        -- lessons/exams/notes/courses/questions/top_students
  entity_id bigint,
  grade text,
  created_at timestamptz not null default now()
);

-- فهارس للترتيب التنازلي حسب الوقت
create index if not exists idx_content_events_created on public.content_events(created_at desc);

-- تفعيل Row Level Security للقراءة فقط
alter table public.content_events enable row level security;

-- سياسة القراءة للجميع (لا يحتوي أي بيانات حساسة)
drop policy if exists content_events_read on public.content_events;
create policy content_events_read
  on public.content_events for select
  to anon, authenticated
  using (true);

-- تفعيل Realtime للنشر الفوري (يمكن تعطيله والاكتفاء بـ Polling إذا أردنا)
-- نتحقق أولاً إن لم يكن الجدول عضواً بالفعل لتجنب خطأ 42710
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'content_events'
  ) then
    alter publication supabase_realtime add table public.content_events;
  end if;
end $$;

-- دالة Trigger لتسجيل الأحداث تلقائياً على جداول المحتوى
create or replace function public.emit_content_event()
returns trigger language plpgsql security definer as $$
begin
  insert into public.content_events(kind, entity, entity_id, grade)
  values (
    lower(tg_op),
    tg_table_name,
    coalesce((to_jsonb(new)->>'id')::bigint, (to_jsonb(old)->>'id')::bigint),
    coalesce(to_jsonb(new)->>'grade', to_jsonb(old)->>'grade')
  );
  return coalesce(new, old);
end $$;

-- تطبيق Triggers على جداول المحتوى الأساسي
-- نستخدم DROP IF EXISTS لجعلها idempotent (قابلة لإعادة التشغيل)
-- الدروس
drop trigger if exists trg_content_lessons on public.lessons;
create trigger trg_content_lessons after insert or update or delete on public.lessons
for each row execute function public.emit_content_event();

-- الامتحانات
drop trigger if exists trg_content_exams on public.exams;
create trigger trg_content_exams after insert or update or delete on public.exams
for each row execute function public.emit_content_event();

-- الأسئلة
drop trigger if exists trg_content_questions on public.questions;
create trigger trg_content_questions after insert or update or delete on public.questions
for each row execute function public.emit_content_event();

-- المذكرات
drop trigger if exists trg_content_notes on public.notes;
create trigger trg_content_notes after insert or update or delete on public.notes
for each row execute function public.emit_content_event();

-- الكورسات
drop trigger if exists trg_content_courses on public.courses;
create trigger trg_content_courses after insert or update or delete on public.courses
for each row execute function public.emit_content_event();

-- أوائل الطلاب
drop trigger if exists trg_content_top_students on public.top_students;
create trigger trg_content_top_students after insert or update or delete on public.top_students
for each row execute function public.emit_content_event();