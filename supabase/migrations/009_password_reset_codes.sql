-- ============ DR Code — Password Reset Activation Codes ============
-- تحصين طلبات تغيير كلمة السر:
--  1) كود تفعيل من 6 أرقام يولَّد عند موافقة الإدارة (يُرسل واتساب) — الاستخدام مرة واحدة وله صلاحية.
--  2) قيود CHECK على الحالة والكود (الكود يظهر فقط للحالة approved).
--  3) فهرس جزئي فريد: طلب نشط واحد فقط لكل طالب.
--  4) سحب أذونات anon/authenticated نهائياً على الجدول (طبقة دفاعية إضافية فوق RLS).

-- العمودان الجديدان:
alter table public.password_resets
  add column if not exists reset_code text,
  add column if not exists code_expires_at bigint;

-- قيد الحالة (قيم معروفة فقط):
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'password_resets_status_check') then
    alter table public.password_resets
      add constraint password_resets_status_check
      check (status in ('pending', 'approved', 'completed', 'rejected'));
  end if;
end $$;

-- الكود يظهر فقط لطلب موافَق عليه (لا كود في pending/rejected/completed):
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'password_resets_code_only_approved') then
    alter table public.password_resets
      add constraint password_resets_code_only_approved
      check (reset_code is null or status = 'approved');
  end if;
end $$;

-- تصفية أي طلبات نشطة مكررة قديمة (نُبقي الأحدث لكل طالب ونرفض الباقي) قبل فرض الفريد:
update public.password_resets pr
set status = 'rejected', updated_at = pr.updated_at
where pr.status in ('pending', 'approved')
  and exists (
    select 1 from public.password_resets newer
    where newer.user_id = pr.user_id
      and newer.status in ('pending', 'approved')
      and newer.id > pr.id
  );

-- طلب نشط واحد فقط لكل طالب (يمنع الغمر بالطلبات المكررة):
create unique index if not exists password_resets_one_active_per_user
  on public.password_resets (user_id)
  where status in ('pending', 'approved');

-- مصادرة الامتيازات من anon/authenticated (الجدول يُدار عبر service_role فقط):
revoke all on public.password_resets from anon, authenticated;