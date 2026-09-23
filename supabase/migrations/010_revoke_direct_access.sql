-- إحكام الأمان (المرحلة 3): التطبيق يتعامل حصريًا عبر دالة edge (service role) —
-- نلغي أي صلاحيات مباشرة للمستخدمين المجهولين/المصادقين على كل جداول التطبيق
-- (فشل-مغلق: أي تجاوز للدالة يحتاج صلاحيات جديدة صراحةً).

revoke all on public.users, public.courses, public.lessons, public.exams, public.questions, public.notes, public.top_students, public.progress, public.exam_results, public.code_files, public.app_config, public.password_resets from anon, authenticated;

-- فهارس مفقودة تخدم الاستعلامات الشائعة
create index if not exists idx_progress_lesson_id on public.progress(lesson_id);
create index if not exists idx_code_files_user_updated on public.code_files(user_id, updated_at desc);
create index if not exists idx_password_resets_user_status on public.password_resets(user_id, status);