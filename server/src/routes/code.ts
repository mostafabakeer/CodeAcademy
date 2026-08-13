import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireSubscriber, type AuthRequest } from '../middleware/auth';
import * as codeFileService from '../services/codeFileService';

export const CODE_LANGUAGES = ['javascript', 'python', 'html', 'css'] as const;

export function codeRoutes(): Router {
  const r = Router();

  r.get('/code', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const files = (await codeFileService.listByUser(uid)).map((f) => ({
        id: f.id,
        name: f.name,
        language: f.language,
        updatedAt: f.updatedAt,
        createdAt: f.createdAt,
      }));
      res.json({ files });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.post('/code', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const { name, language, code } = req.body ?? {};
      const fileName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'ملف جديد';
      const lang = CODE_LANGUAGES.includes(language) ? language : 'javascript';
      const file = await codeFileService.create(uid, {
        name: fileName,
        language: lang,
        code: typeof code === 'string' ? code : '',
      });
      res.json({ file });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/code/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const file = await codeFileService.getByUser(uid, Number(req.params.id));
      if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
      res.json({ file });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // حفظ تلقائي (نقل لقطة جديدة)
  r.put('/code/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const id = Number(req.params.id);
      const { code } = req.body ?? {};
      if (typeof code !== 'string') return res.status(400).json({ error: 'الكود مطلوب' });
      const file = await codeFileService.updateCode(uid, id, code);
      if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
      res.json({ file });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تعديل الاسم / اللغة
  r.patch('/code/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const id = Number(req.params.id);
      const b = req.body ?? {};
      const file = await codeFileService.patch(uid, id, {
        name: b.name !== undefined ? String(b.name).trim().slice(0, 60) : undefined,
        language: b.language !== undefined && CODE_LANGUAGES.includes(b.language) ? b.language : undefined,
      });
      if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
      res.json({ file });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/code/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      await codeFileService.remove(uid, Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
