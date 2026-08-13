import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import * as topStudentService from '../services/topStudentService';
import { GRADES } from './auth';

const TOP_GRADES = ['bac1', 'bac2'];

function bodyText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function topStudentsRoutes(): Router {
  const r = Router();

  // عامة للجميع — أوائل الطلبة مرتبة حسب الترتيب داخل كل صف
  r.get('/top-students', async (_req, res: Response) => {
    try {
      const items = await topStudentService.list();
      const students = items
        .filter((s) => TOP_GRADES.includes(s.grade))
        .sort((a, b) => (a.grade === b.grade ? (a.rank ?? 0) - (b.rank ?? 0) : 0))
        .map((s) => ({
          id: s.id,
          name: s.name,
          image: s.image ?? '',
          rank: Number(s.rank) || 0,
          grade: s.grade,
          gradeName: GRADES[s.grade]?.name ?? s.grade,
        }));
      res.json({ students });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ===== إدارة (أدمن) =====
  r.get('/admin/top-students', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const items = await topStudentService.list();
      const students = items.sort((a, b) => (a.grade === b.grade ? (a.rank ?? 0) - (b.rank ?? 0) : 0));
      const from = (page - 1) * limit;
      const pageItems = students.slice(from, from + limit);
      res.json({ students: pageItems, total: students.length, page, limit });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.post('/admin/top-students', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const { name, image, rank, grade } = req.body ?? {};
      if (!bodyText(name)) return res.status(400).json({ error: 'اسم الطالب مطلوب' });
      if (!TOP_GRADES.includes(grade)) return res.status(400).json({ error: 'الصف الدراسي غير صحيح' });
      const student = await topStudentService.create({
        name: bodyText(name),
        image: bodyText(image),
        rank: Math.max(1, Number(rank) || 1),
        grade,
        createdAt: Date.now(),
      });
      res.json({ student });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/admin/top-students/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const student = await topStudentService.getById(id);
      if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
      const b = req.body ?? {};
      const updated = await topStudentService.update(id, {
        name: b.name !== undefined ? bodyText(b.name) : student.name,
        image: b.image !== undefined ? bodyText(b.image) : student.image,
        rank: b.rank !== undefined ? Math.max(1, Number(b.rank) || 1) : student.rank,
        grade: b.grade !== undefined ? (TOP_GRADES.includes(b.grade) ? b.grade : student.grade) : student.grade,
      });
      res.json({ student: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/admin/top-students/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      await topStudentService.remove(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
