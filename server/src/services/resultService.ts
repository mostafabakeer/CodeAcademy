import { getSupabase } from '../db/supabase';

export interface ExamResult {
  userId: number;
  examId: number;
  best: number;
  score: number;
  correct: number;
  total: number;
  attempts: number;
  answers: Record<string, number>;
  history: { at: number; score: number; correct: number; total: number }[];
  at: number;
}

function fromRow(r: any): ExamResult {
  return {
    userId: r.user_id,
    examId: r.exam_id,
    best: r.best ?? 0,
    score: r.score ?? 0,
    correct: r.correct ?? 0,
    total: r.total ?? 0,
    attempts: r.attempts ?? 0,
    answers: r.answers ?? {},
    history: Array.isArray(r.history) ? r.history : [],
    at: r.at ?? 0,
  };
}

function toRow(r: Partial<ExamResult>): Record<string, any> {
  const row: Record<string, any> = {};
  if (r.userId !== undefined) row.user_id = r.userId;
  if (r.examId !== undefined) row.exam_id = r.examId;
  if (r.best !== undefined) row.best = r.best;
  if (r.score !== undefined) row.score = r.score;
  if (r.correct !== undefined) row.correct = r.correct;
  if (r.total !== undefined) row.total = r.total;
  if (r.attempts !== undefined) row.attempts = r.attempts;
  if (r.answers !== undefined) row.answers = r.answers;
  if (r.history !== undefined) row.history = r.history;
  if (r.at !== undefined) row.at = r.at;
  return row;
}

export async function get(userId: number, examId: number): Promise<ExamResult | null> {
  const { data } = await getSupabase()
    .from('exam_results')
    .select('*')
    .eq('user_id', userId)
    .eq('exam_id', examId)
    .maybeSingle();
  return data ? fromRow(data) : null;
}

export async function upsert(result: ExamResult): Promise<void> {
  await getSupabase()
    .from('exam_results')
    .upsert(toRow(result), { onConflict: 'user_id,exam_id' });
}

export async function listByUser(userId: number): Promise<ExamResult[]> {
  const { data } = await getSupabase().from('exam_results').select('*').eq('user_id', userId);
  return (data ?? []).map(fromRow);
}

export async function listByExam(examId: number): Promise<ExamResult[]> {
  const { data } = await getSupabase().from('exam_results').select('*').eq('exam_id', examId);
  return (data ?? []).map(fromRow);
}
