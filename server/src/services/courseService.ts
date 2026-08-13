import { getSupabase } from '../db/supabase';

export interface Course {
  id: number;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  image: string;
  grade: string;
  order: number;
  createdAt: number;
}

function fromRow(r: any): Course {
  return {
    id: r.id,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    description: r.description ?? '',
    descriptionEn: r.description_en ?? '',
    image: r.image ?? '',
    grade: r.grade ?? 'all',
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function toRow(c: Partial<Course>): Record<string, any> {
  const row: Record<string, any> = {};
  if (c.title !== undefined) row.title = c.title;
  if (c.titleEn !== undefined) row.title_en = c.titleEn;
  if (c.description !== undefined) row.description = c.description;
  if (c.descriptionEn !== undefined) row.description_en = c.descriptionEn;
  if (c.image !== undefined) row.image = c.image;
  if (c.grade !== undefined) row.grade = c.grade;
  if (c.order !== undefined) row.order = c.order;
  if (c.createdAt !== undefined) row.created_at = c.createdAt;
  return row;
}

export async function list(): Promise<Course[]> {
  const { data } = await getSupabase().from('courses').select('*').order('order', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function getById(id: number): Promise<Course | null> {
  const { data } = await getSupabase().from('courses').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function create(input: Omit<Course, 'id'>): Promise<Course> {
  const { data } = await getSupabase().from('courses').insert(toRow(input)).select().single();
  return fromRow(data);
}

export async function update(id: number, patch: Partial<Omit<Course, 'id'>>): Promise<Course | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getById(id);
  const { data } = await getSupabase().from('courses').update(row).eq('id', id).select().maybeSingle();
  return data ? fromRow(data) : null;
}

export async function remove(id: number): Promise<void> {
  // الدروس/الامتحانات/الأسئلة المرتبطة تُحذف تلقائياً عبر FK cascade
  await getSupabase().from('courses').delete().eq('id', id);
}
