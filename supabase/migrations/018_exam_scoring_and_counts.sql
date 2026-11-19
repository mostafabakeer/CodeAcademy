-- 018: توحيد احتساب درجات الامتحانات المختلطة + عدّاد أسئلة دقيق.
--
-- 1) نحفظ نقاط MCQ المكتسبة/القصوى وقت التسليم، حتى تُحسب النتيجة النهائية
--    بنفس وحدة نقاط الأسئلة المقالية بدل خلط نسبة 0–100 مع نقاط خام.
-- 2) العدّاد يستبعد أسئلة MCQ بلا إجابة صحيحة (correct_index = -1)، لأن صفحة
--    الامتحان لا تعرضها. سابقاً كانت القائمة تقول "10 أسئلة" والامتحان يعرض 8.

alter table public.exam_submissions
  add column if not exists mcq_earned_points numeric(8, 2) not null default 0,
  add column if not exists mcq_max_points numeric(8, 2) not null default 0;

create or replace function public.question_counts_for_exams(p_exam_ids bigint[])
returns table (exam_id bigint, questions_count bigint)
language sql
stable
set search_path = public
as $$
  select q.exam_id, count(*) as questions_count
  from public.questions q
  where q.exam_id = any(p_exam_ids)
    and (q.question_type = 'essay' or coalesce(q.correct_index, -1) >= 0)
  group by q.exam_id;
$$;

revoke all on function public.question_counts_for_exams(bigint[]) from public, anon, authenticated;
grant execute on function public.question_counts_for_exams(bigint[]) to service_role;
