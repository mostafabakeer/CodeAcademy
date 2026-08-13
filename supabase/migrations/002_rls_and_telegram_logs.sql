-- ============ DR Code — RLS ============
-- كل الوصول للبيانات يتم عبر الـ Edge Functions (service role يتجاوز RLS).
-- لذلك تُفعَّل RLS على كل الجداول مع منع الوصول المباشر للـ anon/authenticated
-- (الواجهة لا تستعلم الجداول مباشرة أبداً — كل شيء يمر عبر الدوال).

-- ===== تفعيل RLS =====
alter table public.users enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.notes enable row level security;
alter table public.top_students enable row level security;
alter table public.progress enable row level security;
alter table public.exam_results enable row level security;
alter table public.code_files enable row level security;
alter table public.app_config enable row level security;

-- ===== سياسات: منع الوصول المباشر (الافتراضي الآمن) =====
-- المتصفح يستخدم فقط anon key عبر supabase.functions.invoke() ولا يلمس الجداول.
-- service role (داخل الدوال) يتجاوز RLS تلقائياً — لا حاجة لسياسات له.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'users','courses','lessons','exams','questions','notes','top_students',
    'progress','exam_results','code_files','app_config'
  ] loop
    execute format('drop policy if exists "deny all anon" on public.%I', tbl);
    execute format('drop policy if exists "deny all authenticated" on public.%I', tbl);
    execute format('create policy "deny all anon" on public.%I for all to anon using (false) with check (false)', tbl);
    execute format('create policy "deny all authenticated" on public.%I for all to authenticated using (false) with check (false)', tbl);
  end loop;
end $$;
