import { getSupabase } from '../db/supabase';

export interface TopStudent {
  id: number;
  name: string;
  image: string;
  rank: number;
  grade: string;
  createdAt: number;
}

function fromRow(r: any): TopStudent {
  return {
    id: r.id,
    name: r.name ?? '',
    image: r.image ?? '',
    rank: r.rank ?? 1,
    grade: r.grade ?? 'bac1',
    createdAt: r.created_at ?? 0,
  };
}

function toRow(t: Partial<TopStudent>): Record<string, any> {
  const row: Record<string, any> = {};
  if (t.name !== undefined) row.name = t.name;
  if (t.image !== undefined) row.image = t.image;
  if (t.rank !== undefined) row.rank = t.rank;
  if (t.grade !== undefined) row.grade = t.grade;
  if (t.createdAt !== undefined) row.created_at = t.createdAt;
  return row;
}

export async function list(): Promise<TopStudent[]> {
  const { data } = await getSupabase().from('top_students').select('*');
  return (data ?? []).map(fromRow);
}

export async function getById(id: number): Promise<TopStudent | null> {
  const { data } = await getSupabase().from('top_students').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function create(input: Omit<TopStudent, 'id'>): Promise<TopStudent> {
  const { data } = await getSupabase().from('top_students').insert(toRow(input)).select().single();
  return fromRow(data);
}

export async function update(id: number, patch: Partial<Omit<TopStudent, 'id'>>): Promise<TopStudent | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getById(id);
  const { data } = await getSupabase().from('top_students').update(row).eq('id', id).select().maybeSingle();
  return data ? fromRow(data) : null;
}

export async function remove(id: number): Promise<void> {
  await getSupabase().from('top_students').delete().eq('id', id);
}
