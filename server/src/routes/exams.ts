import { Router } from 'express';
import type { Response } from 'express';
import type { AppStore } from '../db/store';
import { requireAuth, requireAdmin, requireSubscriber, type AuthRequest } from '../middleware/auth';
import { gradeAllowed, contentVisible, isContentGrade } from '../utils/access';

function bodyText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function examRoutes(store: AppStore): Router {
  const r = Router();

  // قائمة الامتحانات مع نتيجة الطالب
  r.get('/exams', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const exams = (await store.all<any>('exam:')).filter(({ value }) => contentVisible(reqUser.role, value.grade, reqUser.grade));
      const results = await store.all<any>(`result:${uid}:`);
      const resultByExam = new Map(results.map((res) => [res.value.examId, res.value]));
      const qByExam = new Map<number, number>();
      const questions = await store.all<any>('question:');
      for (const { value: q } of questions) {
        qByExam.set(q.examId, (qByExam.get(q.examId) ?? 0) + 1);
      }
      const out = exams
        .map(({ value: exam }) => ({
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
      const exam = await store.get<any>(`exam:${id}`);
      if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
      if (reqUser.role === 'student' && !gradeAllowed(exam.grade, reqUser.grade)) {
        return res.status(404).json({ error: 'الامتحان غير موجود' });
      }
      const questions = (await store.all<any>('question:'))
        .filter((q) => q.value.examId === id)
        .map(({ value: q }) => ({
          id: q.id,
          text: q.text,
          textEn: q.textEn,
          options: q.options,
          hasImage: !!q.image,
          image: q.image,
          order: q.order,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const lastResult = await store.get(`result:${uid}:${id}`);
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
      const exam = await store.get<any>(`exam:${id}`);
      if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
      if (reqUser.role === 'student' && !gradeAllowed(exam.grade, reqUser.grade)) {
        return res.status(404).json({ error: 'الامتحان غير موجود' });
      }

      const resultKey = `result:${uid}:${id}`;
      const existing = await store.get<any>(resultKey);
      // الطالب يمتحن مرة واحدة فقط ما لم يسمح الأدمن بإعادة الامتحان
      if (existing && !exam.allowRetake) {
        return res.status(403).json({ error: 'لقد أديت هذا الامتحان بالفعل ولا يمكنك إعادته' });
      }

      const answers: Record<string, number> = req.body?.answers ?? {};
      const questions = (await store.all<any>('question:')).filter((q) => q.value.examId === id);

      let correct = 0;
      const review = questions.map(({ value: q }) => {
        const given = answers[String(q.id)];
        const isCorrect = given === q.correctIndex;
        if (isCorrect) correct++;
        return {
          id: q.id,
          text: q.text,
          textEn: q.textEn,
          given,
          correctIndex: q.correctIndex,
          isCorrect,
        };
      });

      const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;

      const result = existing ?? { userId: uid, examId: id, best: 0, attempts: 0, history: [] };
      const best = Math.max(result.best ?? 0, score);
      const updated = {
        ...result,
        userId: uid,
        examId: id,
        score,
        best,
        correct,
        total: questions.length,
        answers,
        attempts: (result.attempts ?? 0) + 1,
        history: [...(result.history ?? []).slice(-19), { at: Date.now(), score, correct, total: questions.length }],
        at: Date.now(),
      };
      await store.set(resultKey, updated);

      res.json({ score, best, correct, total: questions.length, passed: score >= (exam.passingScore ?? 50), review });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ===== إدارة (أدمن) =====
  r.post('/exams', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const { courseId, title, titleEn, timeLimit, passingScore, order, grade, allowRetake } = req.body ?? {};
      if (!bodyText(title)) return res.status(400).json({ error: 'اسم الامتحان مطلوب' });
      const id = await store.nextId();
      const exam = {
        id,
        courseId: courseId ? Number(courseId) : null,
        title: bodyText(title),
        titleEn: bodyText(titleEn),
        timeLimit: timeLimit ? Number(timeLimit) : null,
        passingScore: passingScore !== undefined ? Number(passingScore) : 50,
        grade: isContentGrade(grade) ? grade : 'all',
        allowRetake: !!allowRetake,
        order: Number(order) || 0,
        createdAt: Date.now(),
      };
      await store.set(`exam:${id}`, exam);
      res.json({ exam });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/exams/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const exam = await store.get<any>(`exam:${id}`);
      if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });
      const b = req.body ?? {};
      const updated = {
        ...exam,
        courseId: b.courseId !== undefined ? (b.courseId ? Number(b.courseId) : null) : exam.courseId,
        title: b.title !== undefined ? bodyText(b.title) : exam.title,
        titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : exam.titleEn,
        timeLimit: b.timeLimit !== undefined ? (b.timeLimit ? Number(b.timeLimit) : null) : exam.timeLimit,
        passingScore: b.passingScore !== undefined ? Number(b.passingScore) : exam.passingScore,
        grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : exam.grade) : exam.grade,
        allowRetake: b.allowRetake !== undefined ? !!b.allowRetake : exam.allowRetake,
        order: b.order !== undefined ? Number(b.order) : exam.order,
      };
      await store.set(`exam:${id}`, updated);
      res.json({ exam: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/exams/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const questions = await store.all<any>('question:');
      for (const { key } of questions) {
        if ((await store.get<any>(key)).examId === id) await store.remove(key);
      }
      await store.remove(`exam:${id}`);
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
      const id = await store.nextId();
      const question = {
        id,
        examId,
        text: bodyText(text),
        textEn: bodyText(textEn),
        options: options.map((o: any) => ({ text: bodyText(o.text), textEn: bodyText(o.textEn) })),
        correctIndex: Number(correctIndex),
        image: bodyText(image),
        order: Number(order) || 0,
      };
      await store.set(`question:${id}`, question);
      res.json({ question });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/questions/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const q = await store.get<any>(`question:${id}`);
      if (!q) return res.status(404).json({ error: 'السؤال غير موجود' });
      const b = req.body ?? {};
      const options = b.options !== undefined ? b.options.map((o: any) => ({ text: bodyText(o.text), textEn: bodyText(o.textEn) })) : q.options;
      if (b.correctIndex !== undefined) {
        const idx = Number(b.correctIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
          return res.status(400).json({ error: 'الإجابة الصحيحة خارج نطاق الخيارات' });
        }
      }
      const updated = {
        ...q,
        text: b.text !== undefined ? bodyText(b.text) : q.text,
        textEn: b.textEn !== undefined ? bodyText(b.textEn) : q.textEn,
        options,
        correctIndex: b.correctIndex !== undefined ? Number(b.correctIndex) : q.correctIndex,
        image: b.image !== undefined ? bodyText(b.image) : q.image,
        order: b.order !== undefined ? Number(b.order) : q.order,
      };
      await store.set(`question:${id}`, updated);
      res.json({ question: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/questions/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      await store.remove(`question:${Number(req.params.id)}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
