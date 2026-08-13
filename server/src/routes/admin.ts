import { Router } from 'express';
import type { Response } from 'express';
import type { AppStore } from '../db/store';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { uploadVideo, uploadImage, multerErrorHandler } from '../middleware/upload';
import { computeStudentStats, DEFAULT_LEVELS } from '../utils/levels';
import { GRADES } from './auth';

export function adminRoutes(store: AppStore): Router {
  const r = Router();
  r.use(requireAuth, requireAdmin);

  r.get('/stats', async (_req, res: Response) => {
    try {
      const [users, courses, lessons, exams, notes] = await Promise.all([
        store.all<any>('user:'),
        store.all<any>('course:'),
        store.all<any>('lesson:'),
        store.all<any>('exam:'),
        store.all<any>('note:'),
      ]);
      res.json({
        stats: {
          students: users.filter((u) => u.value.role === 'student').length,
          admins: users.filter((u) => u.value.role === 'admin').length,
          courses: courses.length,
          lessons: lessons.length,
          exams: exams.length,
          notes: notes.length,
          codeFiles: (await store.all<any>('code:')).length,
        },
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/users', async (_req, res: Response) => {
    try {
      const users = await store.all<any>('user:');
      const out = [];
      for (const { value: u } of users) {
        const stats = await computeStudentStats(store, u.id);
        out.push({
          id: u.id,
          fullName: u.fullName,
          phone: u.phone,
          grade: u.grade,
          gradeName: GRADES[u.grade]?.name ?? u.grade,
          role: u.role,
          subscription: !!u.subscription,
          blocked: !!u.blocked,
          createdAt: u.createdAt,
          ...stats,
        });
      }
      res.json({ users: out.sort((a, b) => b.points - a.points) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/users/:id', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await store.get<any>(`user:${id}`);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const stats = await computeStudentStats(store, id);
      const { passwordHash, ...safe } = user;
      const progress = await store.all<any>(`progress:${id}:`);
      const results = await store.all<any>(`result:${id}:`);
      const codeFiles = (await store.all<any>(`code:${id}:`)).map(({ value }) => ({
        id: value.id,
        name: value.name,
        language: value.language,
        updatedAt: value.updatedAt,
      }));
      res.json({
        user: { ...safe, gradeName: GRADES[safe.grade]?.name ?? safe.grade },
        stats,
        progress: progress.map((p) => p.value),
        results: results.map((res) => res.value),
        codeFiles,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // أسئلة امتحان (مع الإجابات الصحيحة) — للأدمن فقط
  r.get('/exams/:id/questions', async (req, res: Response) => {
    try {
      const examId = Number(req.params.id);
      const questions = (await store.all<any>('question:'))
        .filter((q) => q.value.examId === examId)
        .map(({ value }) => value)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json({ questions });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تغيير دور مستخدم (طالب / أدمن)
  r.put('/users/:id/role', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await store.get<any>(`user:${id}`);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const { role } = req.body ?? {};
      if (!['student', 'admin'].includes(role)) return res.status(400).json({ error: 'دور غير صحيح' });
      const updated = { ...user, role };
      await store.set(`user:${id}`, updated);
      res.json({ user: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تفعيل / إيقاف الاشتراك (دفع الاشتراك) لطالب
  r.put('/users/:id/subscription', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await store.get<any>(`user:${id}`);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const { subscription } = req.body ?? {};
      const updated = { ...user, subscription: !!subscription };
      await store.set(`user:${id}`, updated);
      res.json({ user: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // حظر / إلغاء حظر طالب
  r.put('/users/:id/block', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await store.get<any>(`user:${id}`);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const { blocked } = req.body ?? {};
      const updated = { ...user, blocked: !!blocked };
      await store.set(`user:${id}`, updated);
      res.json({ user: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/config', async (_req, res: Response) => {
    try {
      const levels = (await store.get<any>('config:levels')) ?? { tiers: DEFAULT_LEVELS };
      res.json({ config: { levels, grades: GRADES } });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/config/levels', async (req, res: Response) => {
    try {
      const { tiers } = req.body ?? {};
      if (!Array.isArray(tiers) || tiers.length === 0) {
        return res.status(400).json({ error: 'المستويات غير صحيحة' });
      }
      const clean = tiers
        .map((t: any) => ({
          min: Number(t.min) || 0,
          key: String(t.key || 'level'),
          name: String(t.name || ''),
          nameEn: String(t.nameEn || ''),
        }))
        .sort((a: any, b: any) => a.min - b.min);
      await store.set('config:levels', { tiers: clean });
      res.json({ config: { levels: { tiers: clean } } });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // إعادة مزامنة كل البيانات مع تلجرام
  r.post('/sync', async (_req, res: Response) => {
    try {
      const keys = await store.keys();
      for (const key of keys) {
        await store.set(key, await store.get(key));
      }
      await store.flushNow();
      res.json({ ok: true, synced: keys.length });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // رفع فيديو / صورة
  r.post('/upload/video', uploadVideo.single('file'), (req, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  r.post('/upload/image', uploadImage.single('file'), (req, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  r.use(multerErrorHandler);

  return r;
}
