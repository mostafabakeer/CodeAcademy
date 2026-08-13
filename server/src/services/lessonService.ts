import { getSupabase } from '../db/supabase';

export interface Lesson {
  id: number;
  courseId: number;
  title: string;
  titleEn: string;
  videoType: string;
  videoUrl: string;
  duration: number;
  description: string;
  descriptionEn: string;
  grade: string;
  order: number;
  createdAt: number;
}

function fromRow(r: any): Lesson {
  return {
    id: r.id,
    courseId: r.course_id ?? 0,
    title: r.title ?? '',
    titleEn: r.title_en ?? '',
    videoType: r.video_type ?? 'youtube',
    videoUrl: r.video_url ?? '',
    duration: r.duration ?? 0,
    description: r.description ?? '',
    descriptionEn: r.description_en ?? '',
    grade: r.grade ?? 'all',
    order: r.order ?? 0,
    createdAt: r.created_at ?? 0,
  };
}

function toRow(l: Partial<Lesson>): Record<string, any> {
  const row: Record<string, any> = {};
  if (l.courseId !== undefined) row.course_id = l.courseId;
  if (l.title !== undefined) row.title = l.title;
  if (l.titleEn !== undefined) row.title_en = l.titleEn;
  if (l.videoType !== undefined) row.video_type = l.videoType;
  if (l.videoUrl !== undefined) row.video_url = l.videoUrl;
  if (l.duration !== undefined) row.duration = l.duration;
  if (l.description !== undefined) row.description = l.description;
  if (l.descriptionEn !== undefined) row.description_en = l.descriptionEn;
  if (l.grade !== undefined) row.grade = l.grade;
  if (l.order !== undefined) row.order = l.order;
  if (l.createdAt !== undefined) row.created_at = l.createdAt;
  return row;
}

export async function listAll(): Promise<Lesson[]> {
  const { data } = await getSupabase().from('lessons').select('*').order('order', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function listByCourse(courseId: number): Promise<Lesson[]> {
  const { data } = await getSupabase()
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('order', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function getById(id: number): Promise<Lesson | null> {
  const { data } = await getSupabase().from('lessons').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function create(input: Omit<Lesson, 'id'>): Promise<Lesson> {
  const { data } = await getSupabase().from('lessons').insert(toRow(input)).select().single();
  return fromRow(data);
}

export async function update(id: number, patch: Partial<Omit<Lesson, 'id'>>): Promise<Lesson | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getById(id);
  const { data } = await getSupabase().from('lessons').update(row).eq('id', id).select().maybeSingle();
  return data ? fromRow(data) : null;
}

export async function remove(id: number): Promise<void> {
  await getSupabase().from('lessons').delete().eq('id', id);
}
