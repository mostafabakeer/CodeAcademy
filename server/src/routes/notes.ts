import { Router } from 'express';
import type { Response } from 'express';
import type { AppStore } from '../db/store';
import { requireAuth, requireAdmin, requireSubscriber, type AuthRequest } from '../middleware/auth';
import { gradeAllowed, contentVisible, isContentGrade } from '../utils/access';

function bodyText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function noteRoutes(store: AppStore): Router {
  const r = Router();

  r.get('/notes', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const notes = (await store.all<any>('note:'))
        .filter(({ value }) => contentVisible(reqUser.role, value.grade, reqUser.grade))
        .map(({ value }) => value)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json({ notes });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/notes/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const note = await store.get<any>(`note:${Number(req.params.id)}`);
      if (!note) return res.status(404).json({ error: 'المذكرة غير موجودة' });
      if (reqUser.role === 'student' && !gradeAllowed(note.grade, reqUser.grade)) {
        return res.status(404).json({ error: 'المذكرة غير موجودة' });
      }
      res.json({ note });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.post('/notes', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const { courseId, title, titleEn, body, bodyEn, image, order, grade } = req.body ?? {};
      if (!bodyText(title)) return res.status(400).json({ error: 'عنوان المذكرة مطلوب' });
      const id = await store.nextId();
      const note = {
        id,
        courseId: courseId ? Number(courseId) : null,
        title: bodyText(title),
        titleEn: bodyText(titleEn),
        body: bodyText(body),
        bodyEn: bodyText(bodyEn),
        image: bodyText(image),
        grade: isContentGrade(grade) ? grade : 'all',
        order: Number(order) || 0,
        createdAt: Date.now(),
      };
      await store.set(`note:${id}`, note);
      res.json({ note });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/notes/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const note = await store.get<any>(`note:${id}`);
      if (!note) return res.status(404).json({ error: 'المذكرة غير موجودة' });
      const b = req.body ?? {};
      const updated = {
        ...note,
        courseId: b.courseId !== undefined ? (b.courseId ? Number(b.courseId) : null) : note.courseId,
        title: b.title !== undefined ? bodyText(b.title) : note.title,
        titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : note.titleEn,
        body: b.body !== undefined ? bodyText(b.body) : note.body,
        bodyEn: b.bodyEn !== undefined ? bodyText(b.bodyEn) : note.bodyEn,
        image: b.image !== undefined ? bodyText(b.image) : note.image,
        grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : note.grade) : note.grade,
        order: b.order !== undefined ? Number(b.order) : note.order,
      };
      await store.set(`note:${id}`, updated);
      res.json({ note: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/notes/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      await store.remove(`note:${Number(req.params.id)}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
