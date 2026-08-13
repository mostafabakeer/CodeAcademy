import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireSubscriber, type AuthRequest } from '../middleware/auth';
import * as progressService from '../services/progressService';

export function progressRoutes(): Router {
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
      const outcome = await progressService.upsertWatch(uid, Number(lessonId), Number(seconds));
      if (!outcome) return res.status(404).json({ error: 'الدرس غير موجود' });
      res.json({ progress: outcome.progress, completed: outcome.completed, duration: outcome.duration });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
