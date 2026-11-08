-- Aggregate only the questions for exams visible in a user's bootstrap response.
-- This avoids transferring one exam_id per question to the Edge Function.
create or replace function public.question_counts_for_exams(p_exam_ids bigint[])
returns table (exam_id bigint, questions_count bigint)
language sql
stable
set search_path = public
as $$
  select q.exam_id, count(*) as questions_count
  from public.questions q
  where q.exam_id = any(p_exam_ids)
  group by q.exam_id;
$$;

revoke all on function public.question_counts_for_exams(bigint[]) from public, anon, authenticated;
grant execute on function public.question_counts_for_exams(bigint[]) to service_role;
