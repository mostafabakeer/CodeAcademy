-- Add earned_points and maximum_points to exam_results for unified scoring
-- These columns are needed to store the final calculated points for mixed exams (MCQ + Essay)
-- so that the frontend can display the complete breakdown correctly.

alter table public.exam_results
  add column if not exists earned_points numeric(8, 2) not null default 0 check (earned_points >= 0),
  add column if not exists maximum_points numeric(8, 2) not null default 0 check (maximum_points >= 0);