import { Router } from 'express';
import type { Response } from 'express';
import type { AppStore } from '../db/store';
import { requireAuth, requireAdmin, requireSubscriber, type AuthRequest } from '../middleware/auth';
import { gradeAllowed, contentVisible, isContentGrade } from '../utils/access';

function bodyText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function courseRoutes(store: AppStore): Router {
  const r = Router();

  r.get('/courses', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const courses = (await store.all<any>('course:')).filter(({ value }) => contentVisible(reqUser.role, value.grade, reqUser.grade));
      const lessons = await store.all<any>('lesson:');
      const progresses = await store.all<any>(`progress:${uid}:`);
      const watchByLesson = new Map(progresses.map((p) => [p.value.lessonId, Number(p.value.secondsWatched) || 0]));

      const out = courses.map(({ value: course }) => {
        const courseLessons = lessons.filter((l) => l.value.courseId === course.id && contentVisible(reqUser.role, l.value.grade, reqUser.grade));
        let duration = 0;
        let watched = 0;
        let completed = 0;
        for (const { value: l } of courseLessons) {
          const d = Number(l.duration) || 0;
          duration += d;
          const w = Math.min(watchByLesson.get(l.id) ?? 0, d);
          watched += w;
          if (d > 0 && w >= d * 0.9) completed++;
        }
        return {
          ...course,
          lessonCount: courseLessons.length,
          completedLessons: completed,
          duration,
          watchedSeconds: watched,
          progress: duration > 0 ? Math.round((watched / duration) * 100) : 0,
        };
      });

      res.json({ courses: out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/courses/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const id = Number(req.params.id);
      const course = await store.get<any>(`course:${id}`);
      if (!course) return res.status(404).json({ error: 'الكورس غير موجود' });
      if (reqUser.role === 'student' && !gradeAllowed(course.grade, reqUser.grade)) {
        return res.status(404).json({ error: 'الكورس غير موجود' });
      }

      const lessons = (await store.all<any>('lesson:')).filter(
        (l) => l.value.courseId === id && contentVisible(reqUser.role, l.value.grade, reqUser.grade)
      );
      const progresses = await store.all<any>(`progress:${uid}:`);
      const watchByLesson = new Map(progresses.map((p) => [p.value.lessonId, Number(p.value.secondsWatched) || 0]));

      const lessonList = lessons
        .map(({ value: l }) => {
          const d = Number(l.duration) || 0;
          const w = Math.min(watchByLesson.get(l.id) ?? 0, d);
          return { ...l, watchedSeconds: w, completed: d > 0 && w >= d * 0.9, progressPct: d > 0 ? Math.round((w / d) * 100) : 0 };
        })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const exams = (await store.all<any>('exam:')).filter(
        (e) => e.value.courseId === id && contentVisible(reqUser.role, e.value.grade, reqUser.grade)
      ).length;

      res.json({ course, lessons: lessonList, examsCount: exams });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // درس مفرد + قائمة دروس الكورس (للتنقل السابق/التالي)
  r.get('/lesson/:id', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const id = Number(req.params.id);
      const lesson = await store.get<any>(`lesson:${id}`);
      if (!lesson) return res.status(404).json({ error: 'الدرس غير موجود' });

      const course = await store.get<any>(`course:${lesson.courseId}`);
      const lessonGrade = lesson.grade ?? course?.grade;
      if (reqUser.role === 'student' && !gradeAllowed(lessonGrade, reqUser.grade)) {
        return res.status(404).json({ error: 'الدرس غير موجود' });
      }

      const lessons = (await store.all<any>('lesson:')).filter(
        (l) => l.value.courseId === lesson.courseId && contentVisible(reqUser.role, l.value.grade ?? course?.grade, reqUser.grade)
      );
      const progress = await store.get<any>(`progress:${uid}:${id}`);

      let watchByLesson: Map<number, number>;
      {
        const progresses = await store.all<any>(`progress:${uid}:`);
        watchByLesson = new Map(progresses.map((p) => [p.value.lessonId, Number(p.value.secondsWatched) || 0]));
      }

      const duration = Number(lesson.duration) || 0;
      const watched = progress?.secondsWatched ?? Math.min(watchByLesson.get(id) ?? 0, duration);
      const out = {
        ...lesson,
        watchedSeconds: watched,
        completed: duration > 0 ? watched >= duration * 0.9 : false,
        progressPct: duration > 0 ? Math.round((watched / duration) * 100) : 0,
      };

      res.json({
        lesson: out,
        lessons: lessons.map(({ value: l }) => ({ id: l.id, title: l.title, titleEn: l.titleEn })),
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ===== إدارة (أدمن) =====
  r.post('/courses', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const { title, titleEn, description, descriptionEn, image, order, grade } = req.body ?? {};
      if (!bodyText(title)) return res.status(400).json({ error: 'اسم الكورس مطلوب' });
      const id = await store.nextId();
      const course = {
        id,
        title: bodyText(title),
        titleEn: bodyText(titleEn),
        description: bodyText(description),
        descriptionEn: bodyText(descriptionEn),
        image: bodyText(image),
        grade: isContentGrade(grade) ? grade : 'all',
        order: Number(order) || 0,
        createdAt: Date.now(),
      };
      await store.set(`course:${id}`, course);
      res.json({ course });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/courses/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const course = await store.get<any>(`course:${id}`);
      if (!course) return res.status(404).json({ error: 'الكورس غير موجود' });
      const { title, titleEn, description, descriptionEn, image, order, grade } = req.body ?? {};
      const updated = {
        ...course,
        title: title ? bodyText(title) : course.title,
        titleEn: titleEn !== undefined ? bodyText(titleEn) : course.titleEn,
        description: description !== undefined ? bodyText(description) : course.description,
        descriptionEn: descriptionEn !== undefined ? bodyText(descriptionEn) : course.descriptionEn,
        image: image !== undefined ? bodyText(image) : course.image,
        grade: grade !== undefined ? (isContentGrade(grade) ? grade : course.grade) : course.grade,
        order: order !== undefined ? Number(order) : course.order,
      };
      await store.set(`course:${id}`, updated);
      res.json({ course: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/courses/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      // حذف الدروس والامتحانات المرتبطة
      const lessons = await store.all<any>('lesson:');
      for (const { key } of lessons) {
        if ((await store.get<any>(key)).courseId === id) await store.remove(key);
      }
      const exams = await store.all<any>('exam:');
      const examIds = new Set<number>();
      for (const { key } of exams) {
        const exam = await store.get<any>(key);
        if (exam.courseId === id) {
          examIds.add(exam.id);
          await store.remove(key);
        }
      }
      if (examIds.size > 0) {
        const questions = await store.all<any>('question:');
        for (const { key } of questions) {
          if (examIds.has((await store.get<any>(key)).examId)) await store.remove(key);
        }
      }
      await store.remove(`course:${id}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ===== الدروس =====
  r.post('/lessons', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const { courseId, title, titleEn, videoType, videoUrl, duration, description, order, grade } = req.body ?? {};
      if (!courseId || !bodyText(title)) return res.status(400).json({ error: 'معرّف الكورس واسم الدرس مطلوبان' });
      if (!['youtube', 'upload'].includes(videoType) || !bodyText(videoUrl)) {
        return res.status(400).json({ error: 'نوع الفيديو ورابطه مطلوبان' });
      }
      const id = await store.nextId();
      const lesson = {
        id,
        courseId: Number(courseId),
        title: bodyText(title),
        titleEn: bodyText(titleEn),
        videoType,
        videoUrl: bodyText(videoUrl),
        duration: Math.max(0, Number(duration) || 0),
        description: bodyText(description),
        grade: isContentGrade(grade) ? grade : 'all',
        order: Number(order) || 0,
        createdAt: Date.now(),
      };
      await store.set(`lesson:${id}`, lesson);
      res.json({ lesson });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/lessons/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const lesson = await store.get<any>(`lesson:${id}`);
      if (!lesson) return res.status(404).json({ error: 'الدرس غير موجود' });
      const b = req.body ?? {};
      const updated = {
        ...lesson,
        courseId: b.courseId !== undefined ? Number(b.courseId) : lesson.courseId,
        title: b.title !== undefined ? bodyText(b.title) : lesson.title,
        titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : lesson.titleEn,
        videoType: b.videoType !== undefined ? b.videoType : lesson.videoType,
        videoUrl: b.videoUrl !== undefined ? bodyText(b.videoUrl) : lesson.videoUrl,
        duration: b.duration !== undefined ? Math.max(0, Number(b.duration) || 0) : lesson.duration,
        description: b.description !== undefined ? bodyText(b.description) : lesson.description,
        grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : lesson.grade) : lesson.grade,
        order: b.order !== undefined ? Number(b.order) : lesson.order,
      };
      await store.set(`lesson:${id}`, updated);
      res.json({ lesson: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/lessons/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      await store.remove(`lesson:${id}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
