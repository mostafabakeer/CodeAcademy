import { getSupabase } from '../db/supabase';

export interface Note {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  body: string;
  bodyEn: string;
  image: string;
  grade: string;
  order: number;
  createdAt: number;
}

function fromRow(r: any): Note {
  return {
    id: r.id,
    courseId: r.course_id ?? null,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    body: r.body ?? '',
    bodyEn: r.body_en ?? '',
    image: r.image ?? '',
    grade: r.grade ?? 'all',
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function toRow(n: Partial<Note>): Record<string, any> {
  const row: Record<string, any> = {};
  if (n.courseId !== undefined) row.course_id = n.courseId;
  if (n.title !== undefined) row.title = n.title;
  if (n.titleEn !== undefined) row.title_en = n.titleEn;
  if (n.body !== undefined) row.body = n.body;
  if (n.bodyEn !== undefined) row.body_en = n.bodyEn;
  if (n.image !== undefined) row.image = n.image;
  if (n.grade !== undefined) row.grade = n.grade;
  if (n.order !== undefined) row.order = n.order;
  if (n.createdAt !== undefined) row.created_at = n.createdAt;
  return row;
}

export async function listAll(): Promise<Note[]> {
  const { data } = await getSupabase().from('notes').select('*').order('order', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function getById(id: number): Promise<Note | null> {
  const { data } = await getSupabase().from('notes').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function create(input: Omit<Note, 'id'>): Promise<Note> {
  const { data } = await getSupabase().from('notes').insert(toRow(input)).select().single();
  return fromRow(data);
}

export async function update(id: number, patch: Partial<Omit<Note, 'id'>>): Promise<Note | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getById(id);
  const { data } = await getSupabase().from('notes').update(row).eq('id', id).select().maybeSingle();
  return data ? fromRow(data) : null;
}

export async function remove(id: number): Promise<void> {
  await getSupabase().from('notes').delete().eq('id', id);
}
