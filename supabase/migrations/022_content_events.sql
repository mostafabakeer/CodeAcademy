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
alter publication supabase_realtime add table public.content_events;

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
-- الدروس
create trigger trg_content_lessons after insert or update or delete on public.lessons
for each row execute function public.emit_content_event();

-- الامتحانات
create trigger trg_content_exams after insert or update or delete on public.exams
for each row execute function public.emit_content_event();

-- الأسئلة
create trigger trg_content_questions after insert or update or delete on public.questions
for each row execute function public.emit_content_event();

-- المذكرات
create trigger trg_content_notes after insert or update or delete on public.notes
for each row execute function public.emit_content_event();

-- الكورسات
create trigger trg_content_courses after insert or update or delete on public.courses
for each row execute function public.emit_content_event();

-- أوائل الطلاب
create trigger trg_content_top_students after insert or update or delete on public.top_students
for each row execute function public.emit_content_event();