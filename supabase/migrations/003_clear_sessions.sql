-- ============ DR Code — مسح كل جلسات تسجيل الدخول ============
-- ينشئ `session_epoch` بقيمة "الآن" (مرة واحدة فقط)؛ أي توكن JWT صُدِر قبل
-- هذه اللحظة يصبح باطلاً فوراً في كل الدوال، فتُمسح كل الجلسات الحالية
-- ويضطر الجميع لتسجيل الدخول من جديد.
-- يُشغَّل مرة واحدة من SQL Editor. (on conflict do nothing = لا يُعاد التنفيذ)

insert into public.app_config (key, value)
values ('session_epoch', to_jsonb((extract(epoch from now()) * 1000)::bigint))
on conflict (key) do nothing;
