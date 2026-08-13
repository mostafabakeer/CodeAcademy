import { getSupabase } from '../db/supabase';
import * as questionService from './questionService';
import * as resultService from './resultService';
import type { ExamResult } from './resultService';

export interface Exam {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  timeLimit: number | null;
  passingScore: number;
  grade: string;
  allowRetake: boolean;
  order: number;
  createdAt: number;
}

function fromRow(r: any): Exam {
  return {
    id: r.id,
    courseId: r.course_id ?? null,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    timeLimit: r.time_limit ?? null,
    passingScore: r.passing_score ?? 50,
    grade: r.grade ?? 'all',
    allowRetake: !!r.allow_retake,
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function toRow(e: Partial<Exam>): Record<string, any> {
  const row: Record<string, any> = {};
  if (e.courseId !== undefined) row.course_id = e.courseId;
  if (e.title !== undefined) row.title = e.title;
  if (e.titleEn !== undefined) row.title_en = e.titleEn;
  if (e.timeLimit !== undefined) row.time_limit = e.timeLimit;
  if (e.passingScore !== undefined) row.passing_score = e.passingScore;
  if (e.grade !== undefined) row.grade = e.grade;
  if (e.allowRetake !== undefined) row.allow_retake = e.allowRetake;
  if (e.order !== undefined) row.order = e.order;
  if (e.createdAt !== undefined) row.created_at = e.createdAt;
  return row;
}

export async function listAll(): Promise<Exam[]> {
  const { data } = await getSupabase().from('exams').select('*').order('order', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function getById(id: number): Promise<Exam | null> {
  const { data } = await getSupabase().from('exams').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function create(input: Omit<Exam, 'id'>): Promise<Exam> {
  const { data } = await getSupabase().from('exams').insert(toRow(input)).select().single();
  return fromRow(data);
}

export async function update(id: number, patch: Partial<Omit<Exam, 'id'>>): Promise<Exam | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getById(id);
  const { data } = await getSupabase().from('exams').update(row).eq('id', id).select().maybeSingle();
  return data ? fromRow(data) : null;
}

export async function remove(id: number): Promise<void> {
  // الأسئلة والنتائج المرتبطة تُحذف تلقائياً عبر FK cascade
  await getSupabase().from('exams').delete().eq('id', id);
}

export interface SubmitOutcome {
  result: ExamResult;
  score: number;
  best: number;
  correct: number;
  total: number;
  passed: boolean;
  review: { id: number; text: string; textEn: string; given?: number; correctIndex: number; isCorrect: boolean }[];
}

/**
 * تصحيح آلي: يجلب أسئلة الامتحان، يحسب النتيجة، ويحدّث سجل result
 * (best / attempts / history). الافتراض: تحقق route من إمكانية إعادة الامتحان قبل الاستدعاء.
 */
export async function submit(userId: number, exam: Exam, answers: Record<string, number>): Promise<SubmitOutcome> {
  const questions = await questionService.listByExam(exam.id);

  let correct = 0;
  const review = questions.map((q) => {
    const given = answers[String(q.id)];
    const isCorrect = given === q.correctIndex;
    if (isCorrect) correct++;
    return {
      id: q.id,
      text: q.text,
      textEn: q.textEn,
      given,
      correctIndex: q.correctIndex,
      isCorrect,
    };
  });

  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;

  const existing = await resultService.get(userId, exam.id);
  const prev = existing ?? { userId, examId: exam.id, best: 0, score: 0, correct: 0, total: 0, attempts: 0, answers: {}, history: [], at: 0 };
  const best = Math.max(prev.best ?? 0, score);
  const result: ExamResult = {
    ...prev,
    userId,
    examId: exam.id,
    score,
    best,
    correct,
    total: questions.length,
    answers,
    attempts: (prev.attempts ?? 0) + 1,
    history: [...(prev.history ?? []).slice(-19), { at: Date.now(), score, correct, total: questions.length }],
    at: Date.now(),
  };
  await resultService.upsert(result);

  return {
    result,
    score,
    best,
    correct,
    total: questions.length,
    passed: score >= (exam.passingScore ?? 50),
    review,
  };
}
