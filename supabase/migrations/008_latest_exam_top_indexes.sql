-- ============ أوائل الامتحان الأخير + نتائج الامتحانات (لوحة الأدمن) ============

-- أوائل كل امتحان: قراءة سريعة لنتائج امتحان واحد وترتيبها تنازليًا حسب أعلى درجة
create index if not exists idx_exam_results_exam_id on public.exam_results(exam_id);
create index if not exists idx_exam_results_exam_best on public.exam_results(exam_id, best desc);

-- أحدث امتحان لكل مرحلة (فرعي): فلترة حسب المرحلة ثم ترتيب تنازلي حسب وقت الإنشاء ثم id
create index if not exists idx_exams_grade_created on public.exams(grade, created_at desc);