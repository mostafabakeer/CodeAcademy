-- فهارس أداء: تسرع الاستعلامات الشائعة في bootstrap، المتصدرين، التقدم، والنتائج
-- أنشئت تلقائياً كجزء من خطة تحسين الأداء

-- progress: استعلامات تقدم المستخدم لكل درس
create index if not exists idx_progress_user_lesson on public.progress(user_id, lesson_id);

-- exam_results: استعلامات نتائج المستخدم + ترتيب الامتحان
create index if not exists idx_exam_results_user_exam on public.exam_results(user_id, exam_id);
create index if not exists idx_exam_results_exam_best_desc on public.exam_results(exam_id, best desc);

-- lessons / exams / notes: فلترة حسب course_id + grade (شائعة في bootstrap)
create index if not exists idx_lessons_course_grade on public.lessons(course_id, grade);
create index if not exists idx_exams_course_grade on public.exams(course_id, grade);
create index if not exists idx_notes_course_grade on public.notes(course_id, grade);

-- users: فلترة الأدمن والبحث
create index if not exists idx_users_role_subscription_blocked on public.users(role, subscription, blocked);