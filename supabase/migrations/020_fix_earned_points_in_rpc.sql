-- Fix RPC approve_essay_submission to include earned_points and maximum_points in exam_results upsert
-- The original RPC (migration 017) didn't include these columns in the INSERT/UPDATE statement
-- This caused earned_points and maximum_points to remain at default (0) in exam_results

drop function if exists public.approve_essay_submission(
  p_submission_id bigint,
  p_essay_grades jsonb,
  p_score integer,
  p_result_score integer,
  p_earned_points numeric,
  p_maximum_points numeric,
  p_best integer,
  p_attempts integer,
  p_result_correct integer,
  p_result_total integer,
  p_result_answers jsonb,
  p_history jsonb,
  p_result_at bigint,
  p_graded_at bigint
);

create or replace function public.approve_essay_submission(
  p_submission_id bigint,
  p_essay_grades jsonb,
  p_score integer,
  p_result_score integer,
  p_earned_points numeric,
  p_maximum_points numeric,
  p_best integer,
  p_attempts integer,
  p_result_correct integer,
  p_result_total integer,
  p_result_answers jsonb,
  p_history jsonb,
  p_result_at bigint,
  p_graded_at bigint
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  submission public.exam_submissions%rowtype;
begin
  select *
    into submission
    from public.exam_submissions
   where id = p_submission_id
   for update;

  if not found then
    raise exception 'Essay submission % not found', p_submission_id;
  end if;

  update public.exam_submissions
     set status = 'graded',
         essay_grades = p_essay_grades,
         score = p_score,
         earned_points = p_earned_points,
         maximum_points = p_maximum_points,
         graded_at = p_graded_at
   where id = p_submission_id;

  insert into public.exam_results (
    user_id, exam_id, best, score, correct, total, attempts,
    answers, history, at,
    earned_points, maximum_points
  ) values (
    submission.user_id,
    submission.exam_id,
    p_best,
    p_result_score,
    p_result_correct,
    p_result_total,
    p_attempts,
    p_result_answers,
    p_history,
    p_result_at,
    p_earned_points,
    p_maximum_points
  )
  on conflict (user_id, exam_id) do update
     set best = excluded.best,
         score = excluded.score,
         correct = excluded.correct,
         total = excluded.total,
         attempts = excluded.attempts,
         answers = excluded.answers,
         history = excluded.history,
         at = excluded.at,
         earned_points = excluded.earned_points,
         maximum_points = excluded.maximum_points;
end;
$$;

revoke all on function public.approve_essay_submission(
  bigint, jsonb, integer, integer, numeric, numeric, integer, integer,
  integer, integer, jsonb, jsonb, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.approve_essay_submission(
  bigint, jsonb, integer, integer, numeric, numeric, integer, integer,
  integer, integer, jsonb, jsonb, bigint, bigint
) to service_role;