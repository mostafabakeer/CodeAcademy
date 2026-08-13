import { Router } from 'express';
import type { Response } from 'express';
import type { AppStore } from '../db/store';
import { requireAuth, requireSubscriber, type AuthRequest } from '../middleware/auth';

export const CODE_LANGUAGES = ['javascript', 'python', 'html', 'css'] as const;

const MAX_VERSIONS = 20;

export function codeRoutes(store: AppStore): Router {
  const r = Router();

  r.get('/code', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const files = (await store.all<any>(`code:${uid}:`))
        .map(({ value }) => ({ id: value.id, name: value.name, language: value.language, updatedAt: value.updatedAt, createdAt: value.createdAt }))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
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
      const id = await store.nextId();
      const now = Date.now();
      const file = {
        id,
        userId: uid,
        name: fileName,
        language: lang,
        code: typeof code === 'string' ? code : '',
        versions: [{ at: now, code: typeof code === 'string' ? code : '' }],
        createdAt: now,
        updatedAt: now,
      };
      await store.set(`code:${uid}:${id}`, file);
      res.json({ file });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/code/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const file = await store.get<any>(`code:${uid}:${Number(req.params.id)}`);
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
      const file = await store.get<any>(`code:${uid}:${id}`);
      if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
      const { code } = req.body ?? {};
      if (typeof code !== 'string') return res.status(400).json({ error: 'الكود مطلوب' });
      if (code === file.code) return res.json({ file });

      const now = Date.now();
      const versions = [...(file.versions ?? []).slice(-(MAX_VERSIONS - 1)), { at: now, code }];
      const updated = { ...file, code, versions, updatedAt: now };
      await store.set(`code:${uid}:${id}`, updated);
      res.json({ file: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تعديل الاسم / اللغة
  r.patch('/code/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const id = Number(req.params.id);
      const file = await store.get<any>(`code:${uid}:${id}`);
      if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
      const b = req.body ?? {};
      const updated = {
        ...file,
        name: b.name !== undefined ? String(b.name).trim().slice(0, 60) : file.name,
        language: b.language !== undefined && CODE_LANGUAGES.includes(b.language) ? b.language : file.language,
      };
      await store.set(`code:${uid}:${id}`, updated);
      res.json({ file: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/code/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      await store.remove(`code:${uid}:${Number(req.params.id)}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
