-- ============ DR Code — استئصال تيليجرام ============
-- يُنفَّذ من Supabase SQL Editor بعد حذف دوال Telegram.
-- يزيل كل أثر تيليجرام من قاعدة البيانات (مؤمن بـ IF EXISTS).

-- حذف جدول سجل تيليجرام إن وُجد
drop table if exists public.telegram_logs;

-- حذف عمود telegram_meta من code_files إن وُجد (أُضيف يدوياً سابقاً)
alter table public.code_files drop column if exists telegram_meta;

-- أي فهارس متروكة من الجدول المحذوف
drop index if exists idx_telegram_logs_created_at;
drop index if exists idx_telegram_logs_kind;
