import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireAdmin, requireSubscriber, type AuthRequest } from '../middleware/auth';
import { gradeAllowed, contentVisible, isContentGrade } from '../utils/access';
import * as courseService from '../services/courseService';
import * as lessonService from '../services/lessonService';
import * as examService from '../services/examService';
import * as progressService from '../services/progressService';

function bodyText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function courseRoutes(): Router {
  const r = Router();

  r.get('/courses', requireAuth, requireSubscriber, async (req, res: Response) => {
    try {
      const reqUser = (req as AuthRequest).user!;
      const uid = reqUser.id;
      const allCourses = await courseService.list();
      const courses = allCourses.filter((c) => contentVisible(reqUser.role, c.grade, reqUser.grade));
      const lessons = await lessonService.listAll();
      const progresses = await progressService.listByUser(uid);
      const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

      const out = courses.map((course) => {
        const courseLessons = lessons.filter((l) => l.courseId === course.id && contentVisible(reqUser.role, l.grade, reqUser.grade));
        let duration = 0;
        let watched = 0;
        let completed = 0;
        for (const l of courseLessons) {
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
      const course = await courseService.getById(id);
      if (!course) return res.status(404).json({ error: 'الكورس غير موجود' });
      if (reqUser.role === 'student' && !gradeAllowed(course.grade, reqUser.grade)) {
        return res.status(404).json({ error: 'الكورس غير موجود' });
      }

      const allLessons = await lessonService.listAll();
      const lessons = allLessons.filter((l) => l.courseId === id && contentVisible(reqUser.role, l.grade, reqUser.grade));
      const progresses = await progressService.listByUser(uid);
      const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

      const lessonList = lessons
        .map((l) => {
          const d = Number(l.duration) || 0;
          const w = Math.min(watchByLesson.get(l.id) ?? 0, d);
          return { ...l, watchedSeconds: w, completed: d > 0 && w >= d * 0.9, progressPct: d > 0 ? Math.round((w / d) * 100) : 0 };
        })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const exams = (await examService.listAll()).filter(
        (e) => e.courseId === id && contentVisible(reqUser.role, e.grade, reqUser.grade)
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
      const lesson = await lessonService.getById(id);
      if (!lesson) return res.status(404).json({ error: 'الدرس غير موجود' });

      const course = await courseService.getById(lesson.courseId);
      const lessonGrade = lesson.grade ?? course?.grade;
      if (reqUser.role === 'student' && !gradeAllowed(lessonGrade, reqUser.grade)) {
        return res.status(404).json({ error: 'الدرس غير موجود' });
      }

      const allLessons = await lessonService.listAll();
      const lessons = allLessons.filter(
        (l) => l.courseId === lesson.courseId && contentVisible(reqUser.role, l.grade ?? course?.grade, reqUser.grade)
      );
      const progress = await progressService.get(uid, id);
      const progresses = await progressService.listByUser(uid);
      const watchByLesson = new Map(progresses.map((p) => [p.lessonId, Number(p.secondsWatched) || 0]));

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
        lessons: lessons.map((l) => ({ id: l.id, title: l.title, titleEn: l.titleEn })),
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
      const course = await courseService.create({
        title: bodyText(title),
        titleEn: bodyText(titleEn),
        description: bodyText(description),
        descriptionEn: bodyText(descriptionEn),
        image: bodyText(image),
        grade: isContentGrade(grade) ? grade : 'all',
        order: Number(order) || 0,
        createdAt: Date.now(),
      });
      res.json({ course });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/courses/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const course = await courseService.getById(id);
      if (!course) return res.status(404).json({ error: 'الكورس غير موجود' });
      const { title, titleEn, description, descriptionEn, image, order, grade } = req.body ?? {};
      const updated = await courseService.update(id, {
        title: title !== undefined ? bodyText(title) : course.title,
        titleEn: titleEn !== undefined ? bodyText(titleEn) : course.titleEn,
        description: description !== undefined ? bodyText(description) : course.description,
        descriptionEn: descriptionEn !== undefined ? bodyText(descriptionEn) : course.descriptionEn,
        image: image !== undefined ? bodyText(image) : course.image,
        grade: grade !== undefined ? (isContentGrade(grade) ? grade : course.grade) : course.grade,
        order: order !== undefined ? Number(order) : course.order,
      });
      res.json({ course: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/courses/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      await courseService.remove(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ===== الدروس =====
  r.post('/lessons', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const { courseId, title, titleEn, videoType, videoUrl, duration, description, descriptionEn, order, grade } = req.body ?? {};
      if (!courseId || !bodyText(title)) return res.status(400).json({ error: 'معرّف الكورس واسم الدرس مطلوبان' });
      if (!['youtube', 'upload'].includes(videoType) || !bodyText(videoUrl)) {
        return res.status(400).json({ error: 'نوع الفيديو ورابطه مطلوبان' });
      }
      const lesson = await lessonService.create({
        courseId: Number(courseId),
        title: bodyText(title),
        titleEn: bodyText(titleEn),
        videoType,
        videoUrl: bodyText(videoUrl),
        duration: Math.max(0, Number(duration) || 0),
        description: bodyText(description),
        descriptionEn: bodyText(descriptionEn),
        grade: isContentGrade(grade) ? grade : 'all',
        order: Number(order) || 0,
        createdAt: Date.now(),
      });
      res.json({ lesson });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.put('/lessons/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      const id = Number(req.params.id);
      const lesson = await lessonService.getById(id);
      if (!lesson) return res.status(404).json({ error: 'الدرس غير موجود' });
      const b = req.body ?? {};
      const updated = await lessonService.update(id, {
        courseId: b.courseId !== undefined ? Number(b.courseId) : lesson.courseId,
        title: b.title !== undefined ? bodyText(b.title) : lesson.title,
        titleEn: b.titleEn !== undefined ? bodyText(b.titleEn) : lesson.titleEn,
        videoType: b.videoType !== undefined ? b.videoType : lesson.videoType,
        videoUrl: b.videoUrl !== undefined ? bodyText(b.videoUrl) : lesson.videoUrl,
        duration: b.duration !== undefined ? Math.max(0, Number(b.duration) || 0) : lesson.duration,
        description: b.description !== undefined ? bodyText(b.description) : lesson.description,
        descriptionEn: b.descriptionEn !== undefined ? bodyText(b.descriptionEn) : lesson.descriptionEn,
        grade: b.grade !== undefined ? (isContentGrade(b.grade) ? b.grade : lesson.grade) : lesson.grade,
        order: b.order !== undefined ? Number(b.order) : lesson.order,
      });
      res.json({ lesson: updated });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.delete('/lessons/:id', requireAuth, requireAdmin, async (req, res: Response) => {
    try {
      await lessonService.remove(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
