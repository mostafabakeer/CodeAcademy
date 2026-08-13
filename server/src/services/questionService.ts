import { getSupabase } from '../db/supabase';

export interface Question {
  id: number;
  examId: number;
  text: string;
  textEn: string;
  options: { text: string; textEn: string }[];
  correctIndex: number;
  image: string;
  order: number;
}

function fromRow(r: any): Question {
  return {
    id: r.id,
    examId: r.exam_id ?? 0,
    text: r.text ?? '',
    textEn: r.text_en ?? '',
    options: Array.isArray(r.options) ? r.options : [],
    correctIndex: r.correct_index ?? 0,
    image: r.image ?? '',
    order: r.order ?? 0,
  };
}

function toRow(q: Partial<Question>): Record<string, any> {
  const row: Record<string, any> = {};
  if (q.examId !== undefined) row.exam_id = q.examId;
  if (q.text !== undefined) row.text = q.text;
  if (q.textEn !== undefined) row.text_en = q.textEn;
  if (q.options !== undefined) row.options = q.options;
  if (q.correctIndex !== undefined) row.correct_index = q.correctIndex;
  if (q.image !== undefined) row.image = q.image;
  if (q.order !== undefined) row.order = q.order;
  return row;
}

export async function listByExam(examId: number): Promise<Question[]> {
  const { data } = await getSupabase()
    .from('questions')
    .select('*')
    .eq('exam_id', examId)
    .order('order', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function getById(id: number): Promise<Question | null> {
  const { data } = await getSupabase().from('questions').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function create(input: Omit<Question, 'id'>): Promise<Question> {
  const { data } = await getSupabase().from('questions').insert(toRow(input)).select().single();
  return fromRow(data);
}

export async function update(id: number, patch: Partial<Omit<Question, 'id'>>): Promise<Question | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getById(id);
  const { data } = await getSupabase().from('questions').update(row).eq('id', id).select().maybeSingle();
  return data ? fromRow(data) : null;
}

export async function remove(id: number): Promise<void> {
  await getSupabase().from('questions').delete().eq('id', id);
}
