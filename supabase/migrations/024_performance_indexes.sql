-- =================== فهارس أداء إضافية ===================
-- لتحسين استعلامات API الشائعة: /exams/:id, /progress/sync, /bootstrap

-- 1. فهرس مركب للأسئلة: الفلترة حسب exam_id + question_type + correct_index
-- يستخدم في getExamQuestions (يستبعد essay + correct_index < 0)
create index if not exists idx_questions_exam_type_correct
on public.questions (exam_id, question_type, correct_index)
where question_type = 'mcq' and correct_index >= 0;

-- 2. فهرس مركب للتقدم: user_id + lesson_id
-- يستخدم في progress/sync و listProgressByUser
create index if not exists idx_progress_user_lesson
on public.progress (user_id, lesson_id)
include (seconds_watched, updated_at);

-- 3. فهرس لجلب نتائج الامتحان مع التاريخ
-- يستخدم في /exams/:id (getResult, getLatestEssaySubmission)
create index if not exists idx_exam_results_user_exam_at
on public.exam_results (user_id, exam_id, at desc);

-- 4. فهرس لتقديمات الامتحانات مع الحالة
-- يستخدم في getLatestEssaySubmission, listEssaySubmissionsForAdmin
create index if not exists idx_exam_submissions_user_exam_status
on public.exam_submissions (user_id, exam_id, status, submitted_at desc);

-- 5. فهرس للـ content_events للـ polling
-- يستخدم في /content-version endpoint
create index if not exists idx_content_events_id_desc
on public.content_events (id desc);

-- 6. فهرس للإشعارات push - الفلترة حسب المستخدم
-- يستخدم في sendPushToGrade (الفلترة بالمرحلة تتم عبر join مع users)
create index if not exists idx_push_subscriptions_user
on public.push_subscriptions (user_id)
include (endpoint, p256dh, auth);

-- 7. فهرس للكورسات: ترتيب + فلترة المرحلة
-- يستخدم في listCoursesByGrade
create index if not exists idx_courses_grade_order
on public.courses (grade, "order");

-- 8. فهرس للدروس: الكورس + المرحلة + الترتيب
-- يستخدم في listLessonsByCourseAndGrade
create index if not exists idx_lessons_course_grade_order
on public.lessons (course_id, grade, "order");

-- 9. فهرس للمذكرات: المرحلة + الترتيب
-- يستخدم في listNotesByGrade
create index if not exists idx_notes_grade_order
on public.notes (grade, "order");

-- 10. فهرس لملفات الكود: المستخدم + تاريخ التحديث
-- يستخدم في listCodeFilesByUser
create index if not exists idx_code_files_user_updated
on public.code_files (user_id, updated_at desc);

-- 11. فهرس للمستخدمين: البحث + الفلترة
-- يستخدم في /admin/users مع البحث والفلترة
create index if not exists idx_users_search_filter
on public.users (role, subscription, blocked, grade, created_at desc)
include (full_name, phone);