import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { uploadVideo, uploadImage, multerErrorHandler } from '../middleware/upload';
import { computeStudentStats } from '../services/statsService';
import { loadEnv } from '../config/env';
import * as userService from '../services/userService';
import * as courseService from '../services/courseService';
import * as lessonService from '../services/lessonService';
import * as examService from '../services/examService';
import * as noteService from '../services/noteService';
import * as questionService from '../services/questionService';
import * as codeFileService from '../services/codeFileService';
import * as progressService from '../services/progressService';
import * as resultService from '../services/resultService';
import * as configService from '../services/configService';
import * as uploadService from '../services/uploadService';
import { GRADES } from './auth';

export function adminRoutes(): Router {
  const r = Router();
  r.use(requireAuth, requireAdmin);

  r.get('/stats', async (_req, res: Response) => {
    try {
      const [users, courses, lessons, exams, notes, codeFiles] = await Promise.all([
        userService.listAll(),
        courseService.list(),
        lessonService.listAll(),
        examService.listAll(),
        noteService.listAll(),
        countAllCodeFiles(),
      ]);
      res.json({
        stats: {
          students: users.filter((u) => u.role === 'student').length,
          admins: users.filter((u) => u.role === 'admin').length,
          courses: courses.length,
          lessons: lessons.length,
          exams: exams.length,
          notes: notes.length,
          codeFiles: codeFiles.count,
        },
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/users', async (req, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const { users, total } = await userService.list({ page, limit, search });
      const out = [];
      for (const u of users) {
        const stats = await computeStudentStats(u.id);
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
      res.json({ users: out.sort((a, b) => b.points - a.points), total, page, limit });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/users/:id', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await userService.getById(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const stats = await computeStudentStats(id);
      const safe = userService.safeUser(user);
      const progress = await progressService.listByUser(id);
      const results = await resultService.listByUser(id);
      const codeFiles = (await codeFileService.listByUser(id)).map((f) => ({
        id: f.id,
        name: f.name,
        language: f.language,
        updatedAt: f.updatedAt,
      }));
      res.json({
        user: { ...safe, gradeName: GRADES[safe.grade]?.name ?? safe.grade },
        stats,
        progress,
        results,
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
      const questions = await questionService.listByExam(examId);
      res.json({ questions });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تغيير دور مستخدم (طالب / أدمن)
  r.put('/users/:id/role', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await userService.getById(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const { role } = req.body ?? {};
      if (!['student', 'admin'].includes(role)) return res.status(400).json({ error: 'دور غير صحيح' });
      const updated = await userService.setRole(id, role);
      res.json({ user: userService.safeUser(updated!) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تفعيل / إيقاف الاشتراك (دفع الاشتراك) لطالب
  r.put('/users/:id/subscription', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await userService.getById(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const { subscription } = req.body ?? {};
      const updated = await userService.setSubscription(id, !!subscription);
      res.json({ user: userService.safeUser(updated!) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // حظر / إلغاء حظر طالب
  r.put('/users/:id/block', async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const user = await userService.getById(id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const { blocked } = req.body ?? {};
      const updated = await userService.setBlocked(id, !!blocked);
      res.json({ user: userService.safeUser(updated!) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/config', async (_req, res: Response) => {
    try {
      const levels = await configService.getLevels();
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
      const clean = await configService.setLevels(tiers);
      res.json({ config: { levels: clean } });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // إعادة عكس مرآة كل ملفات الكود على تيليجرام (نسخة احتياطية)
  r.post('/sync', async (_req, res: Response) => {
    try {
      const synced = await codeFileService.resyncAll();
      res.json({ ok: true, synced });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // رفع فيديو / صورة → Supabase Storage
  r.post('/upload/video', uploadVideo.single('file'), async (req, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
      const out = await uploadService.uploadFile(loadEnv().bucketVideos, req.file);
      res.json({ url: out.url });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.post('/upload/image', uploadImage.single('file'), async (req, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
      const out = await uploadService.uploadFile(loadEnv().bucketImages, req.file);
      res.json({ url: out.url });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  r.use(multerErrorHandler);

  return r;
}

async function countAllCodeFiles(): Promise<{ count: number }> {
  const { getSupabase } = await import('../db/supabase');
  const { count } = await getSupabase().from('code_files').select('id', { count: 'exact', head: true });
  return { count: count ?? 0 };
}

