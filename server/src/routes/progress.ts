import { Router } from 'express';
import type { Response } from 'express';
import type { AppStore } from '../db/store';
import { requireAuth, requireSubscriber, type AuthRequest } from '../middleware/auth';

export function progressRoutes(store: AppStore): Router {
  const r = Router();

  /**
   * تحديث مدة المشاهدة لدرس معين.
   * body: { lessonId, seconds } — إجمالي الثواني المُشاهدة (يزيد تراكمياً بأقصى حد)
   */
  r.post('/progress/watch', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const { lessonId, seconds } = req.body ?? {};
      if (!lessonId || typeof seconds !== 'number') {
        return res.status(400).json({ error: 'lessonId و seconds مطلوبان' });
      }

      const lesson = await store.get<any>(`lesson:${Number(lessonId)}`);
      if (!lesson) return res.status(404).json({ error: 'الدرس غير موجود' });

      const key = `progress:${uid}:${Number(lessonId)}`;
      const existing = (await store.get<any>(key)) ?? { userId: uid, lessonId: Number(lessonId), secondsWatched: 0, completed: false, updatedAt: 0 };
      const duration = Number(lesson.duration) || 0;
      const watched = Math.max(existing.secondsWatched || 0, Math.min(Number(seconds), duration));
      const completed = duration > 0 ? watched >= duration * 0.9 : false;

      const progress = { ...existing, secondsWatched: watched, completed, updatedAt: Date.now() };
      await store.set(key, progress);
      res.json({ progress, completed, duration });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
