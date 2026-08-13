import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { loadEnv, type Env } from './config/env';
import { logger } from './utils/logger';
import { getSupabase } from './db/supabase';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth';
import { courseRoutes } from './routes/courses';
import { progressRoutes } from './routes/progress';
import { examRoutes } from './routes/exams';
import { noteRoutes } from './routes/notes';
import { codeRoutes } from './routes/code';
import { topStudentsRoutes } from './routes/topStudents';
import { adminRoutes } from './routes/admin';

export function createApp(env: Env): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          mediaSrc: ["'self'", 'blob:', 'https:', 'http:'],
          frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
          connectSrc: ["'self'", 'https:', 'http:'],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
        },
      },
    })
  );
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
    })
  );
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));

  // تسجيل الطلبات عبر pino
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.originalUrl }, 'req');
    next();
  });

  // حماية مسارات تسجيل الدخول من التخمين
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'طلبات كثيرة جداً، حاول بعد قليل' },
  });
  app.use('/api/auth', authLimiter);

  // الصحة — يفحص قاعدة البيانات فعلياً
  app.get('/api/health', async (_req, res) => {
    try {
      const { error } = await getSupabase().from('app_config').select('key').limit(1);
      if (error) throw error;
      res.json({ ok: true, db: 'up' });
    } catch (e) {
      res.status(503).json({ ok: false, db: 'down', error: (e as Error).message });
    }
  });

  // الواجهات
  app.use('/api/auth', authRoutes());
  app.use('/api', courseRoutes());
  app.use('/api', progressRoutes());
  app.use('/api', examRoutes());
  app.use('/api', noteRoutes());
  app.use('/api', codeRoutes());
  app.use('/api', topStudentsRoutes());
  app.use('/api/admin', adminRoutes());

  // الواجهة الأمامية المبنية (production) — تُخدم من نفس الخادم
  const clientDist = path.join(env.rootDir, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ ok: true, name: 'DR Code API', docs: 'قم ببناء الواجهة (npm run build --prefix client) أو استخدم vite dev على 5173' });
    });
  }

  app.use(errorHandler);

  return app;
}
