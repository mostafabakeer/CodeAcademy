import { getSupabase } from '../db/supabase';
import * as lessonService from './lessonService';

export interface Progress {
  userId: number;
  lessonId: number;
  secondsWatched: number;
  completed: boolean;
  updatedAt: number;
}

function fromRow(r: any): Progress {
  return {
    userId: r.user_id,
    lessonId: r.lesson_id,
    secondsWatched: r.seconds_watched ?? 0,
    completed: !!r.completed,
    updatedAt: r.updated_at ?? 0,
  };
}

function toRow(p: Partial<Progress>): Record<string, any> {
  const row: Record<string, any> = {};
  if (p.userId !== undefined) row.user_id = p.userId;
  if (p.lessonId !== undefined) row.lesson_id = p.lessonId;
  if (p.secondsWatched !== undefined) row.seconds_watched = p.secondsWatched;
  if (p.completed !== undefined) row.completed = p.completed;
  if (p.updatedAt !== undefined) row.updated_at = p.updatedAt;
  return row;
}

export async function get(userId: number, lessonId: number): Promise<Progress | null> {
  const { data } = await getSupabase()
    .from('progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  return data ? fromRow(data) : null;
}

export async function listByUser(userId: number): Promise<Progress[]> {
  const { data } = await getSupabase().from('progress').select('*').eq('user_id', userId);
  return (data ?? []).map(fromRow);
}

export interface WatchOutcome {
  progress: Progress;
  completed: boolean;
  duration: number;
}

/**
 * تحديث مدة المشاهدة لدرس: يحسب completed عند 90% من المدة.
 * يعيد null لو الدرس غير موجود.
 */
export async function upsertWatch(userId: number, lessonId: number, seconds: number): Promise<WatchOutcome | null> {
  const lesson = await lessonService.getById(lessonId);
  if (!lesson) return null;

  const existing = (await get(userId, lessonId)) ?? { userId, lessonId, secondsWatched: 0, completed: false, updatedAt: 0 };
  const duration = Number(lesson.duration) || 0;
  const watched = Math.max(existing.secondsWatched || 0, Math.min(Number(seconds), duration));
  const completed = duration > 0 ? watched >= duration * 0.9 : false;

  const progress: Progress = { ...existing, secondsWatched: watched, completed, updatedAt: Date.now() };
  await getSupabase()
    .from('progress')
    .upsert(toRow(progress), { onConflict: 'user_id,lesson_id' });

  return { progress, completed, duration };
}
