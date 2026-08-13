import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireAdmin, requireSubscriber, type AuthRequest } from '../middleware/auth';
import { gradeAllowed, contentVisible, isContentGrade } from '../utils/access';
import * as examService from '../services/examService';
import * as questionService from '../services/questionService';
import * as resultService from '../services/resultService';

function bodyText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function examRoutes(): Router {
  const r = Router();

  // قائمة الامتحانات مع نتيجة الطالب
  r.get('/exams', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const exams = (await examService.listAll()).filter((e) => contentVisible(reqUser.role, e.grade, reqUser.grade));
      const results = await resultService.listByUser(uid);
      const resultByExam = new Map(results.map((res) => [res.examId, res]));
      const qByExam = new Map<number, number>();
      const questions = await Promise.all(exams.map((e) => questionService.listByExam(e.id)));
      exams.forEach((e, i) => qByExam.set(e.id, questions[i].length));

      const out = exams
        .map((exam) => ({
          ...exam,
          questionsCount: qByExam.get(exam.id) ?? 0,
          taken: resultByExam.has(exam.id),
          bestScore: resultByExam.get(exam.id)?.best ?? null,
          attempts: resultByExam.get(exam.id)?.attempts ?? 0,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json({ exams: out });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تفاصيل الامتحان (بدون الإجابات الصحيحة)
  r.get('/exams/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const id = Number(req.params.id);
      const exam = await examService.getById(id);
      if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
      if (reqUser.role === 'student' && !gradeAllowed(exam.grade, reqUser.grade)) {
        return res.status(404).json({ error: 'الامتحان غير موجود' });
      }
      const questions = (await questionService.listByExam(id)).map((q) => ({
        id: q.id,
        text: q.text,
        textEn: q.textEn,
        options: q.options,
        hasImage: !!q.image,
        image: q.image,
        order: q.order,
      }));
      const lastResult = await resultService.get(uid, id);
      res.json({ exam, questions, lastResult });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // تقديم الامتحان + تصحيح آلي
  r.post('/exams/:id/submit', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const id = Number(req.params.id);
      const exam = await examService.getById(id);
      if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
      if (reqUser.role === 'student' && !gradeAllowed(exam.grade, reqUser.grade)) {
        return res.status(404).json({ error: 'الامتحان غير موجود' });
      }

      const existing = await resultService.get(uid, id);
      // الطالب يمتحن مرة واحدة فقط ما لم يسمح الأدمن بإعادة الامتحان
      if (existing && !exam.allowRetake) {
        return res.status(403).json({ error: 'لقد أديت هذا الامتحان بالفعل ولا يمكنك إعادته' });
      }

      const answers: Record<string, number> = req.body?.answers ?? {};
      const outcome = await examService.submit(uid, exam, answers);

      res.json({
        score: outcome.score,
        best: outcome.best,
        correct: outcome.correct,
        total: outcome.total,
        passed: outcome.passed,
        review: outcome.review,
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ===== إدارة (أدمن) =====
  r.post('/exams', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const { courseId, title, titleEn, timeLimit, passingScore, order, grade, allowRetake } = req.body ?? {};
      if (!bodyText(title)) return res.status(400).json({ error: 'اسم الامتحان مطلوب' });
      const exam = await examService.create({
        courseId: courseId ? Number(courseId) : null,
        title: bodyText(title),
        titleEn: bodyText(titleEn),
        timeLimit: timeLimit ? Number(timeLimit) : null,
        passingScore: passingScore !== undefined ? Number(passingScore) : 50,
        grade: isContentGrade(grade) ? grade : 'all',
        allowRetake: !!allowRetake,
        order: Number(order) || 0,
        createdAt: Date.now(),
      });
      res.json({ exam });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/exams/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const exam = await examService.getById(id);
      if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
      const b = req.body ?? {};
      const updated = await examService.update(id, {
        courseId: b.courseId !== undefined ? (b.courseId ? Number(b.courseId) : null) : exam.courseId,
        title: b.title !== undefined ? bodyText(b.title) : exam.title,
        titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : exam.titleEn,
        timeLimit: b.timeLimit !== undefined ? (b.timeLimit ? Number(b.timeLimit) : null) : exam.timeLimit,
        passingScore: b.passingScore !== undefined ? Number(b.passingScore) : exam.passingScore,
        grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : exam.grade) : exam.grade,
        allowRetake: b.allowRetake !== undefined ? !!b.allowRetake : exam.allowRetake,
        order: b.order !== undefined ? Number(b.order) : exam.order,
      });
      res.json({ exam: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/exams/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      await examService.remove(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.post('/exams/:id/questions', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const examId = Number(req.params.id);
      const { text, textEn, options, correctIndex, image, order } = req.body ?? {};
      if (!bodyText(text) || !Array.isArray(options) || options.length < 2 || correctIndex === undefined) {
        return res.status(400).json({ error: 'نص السؤال والخيارات والإجابة الصحيحة مطلوبة' });
      }
      if (correctIndex < 0 || correctIndex >= options.length) {
        return res.status(400).json({ error: 'الإجابة الصحيحة خارج نطاق الخيارات' });
      }
      const question = await questionService.create({
        examId,
        text: bodyText(text),
        textEn: bodyText(textEn),
        options: options.map((o: any) => ({ text: bodyText(o.text), textEn: bodyText(o.textEn) })),
        correctIndex: Number(correctIndex),
        image: bodyText(image),
        order: Number(order) || 0,
      });
      res.json({ question });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/questions/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const q = await questionService.getById(id);
      if (!q) return res.status(404).json({ error: 'السؤال غير موجود' });
      const b = req.body ?? {};
      const options = b.options !== undefined ? b.options.map((o: any) => ({ text: bodyText(o.text), textEn: bodyText(o.textEn) })) : q.options;
      if (b.correctIndex !== undefined) {
        const idx = Number(b.correctIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
          return res.status(400).json({ error: 'الإجابة الصحيحة خارج نطاق الخيارات' });
        }
      }
      const updated = await questionService.update(id, {
        text: b.text !== undefined ? bodyText(b.text) : q.text,
        textEn: b.textEn !== undefined ? bodyText(b.textEn) : q.textEn,
        options,
        correctIndex: b.correctIndex !== undefined ? Number(b.correctIndex) : q.correctIndex,
        image: b.image !== undefined ? bodyText(b.image) : q.image,
        order: b.order !== undefined ? Number(b.order) : q.order,
      });
      res.json({ question: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/questions/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      await questionService.remove(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
