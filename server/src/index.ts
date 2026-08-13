import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';
import { AppStore } from './db/store';
import { TelegramClient } from './telegram/client';
import { authRoutes } from './routes/auth';
import { courseRoutes } from './routes/courses';
import { progressRoutes } from './routes/progress';
import { examRoutes } from './routes/exams';
import { noteRoutes } from './routes/notes';
import { codeRoutes } from './routes/code';
import { topStudentsRoutes } from './routes/topStudents';
import { adminRoutes } from './routes/admin';
import { seed } from './seed';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // طبقة تلجرام
  let telegram: TelegramClient | null = null;
  if (config.botToken && config.channelId) {
    telegram = new TelegramClient(config.botToken, config.channelId);
    try {
      const me = await telegram.getMe();
      console.log(`[telegram] ✓ متصل: @${me.username} → قناة ${config.channelId}`);
    } catch (e) {
      console.warn('[telegram] ✗ غير متصل (سيعمل الموقع على النسخة المحلية):', (e as Error).message);
      telegram = null;
    }
  } else {
    console.warn('[telegram] لا يوجد TELEGRAM_BOT_TOKEN — يعمل على النسخة المحلية فقط. أضف الإعدادات في server/.env');
  }

  const store = new AppStore(telegram);
  await store.init();
  (globalThis as any).__store = store;

  await seed(store);

  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));

  // تسجيل الطلبات (مؤقت للتشخيص)
  app.use((req, _res, next) => {
    console.log(`[req] ${req.method} ${req.originalUrl}`);
    next();
  });

  // الملفات المرفوعة (فيديوهات وصور)
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadsDir));

  // الصحة
  app.get('/api/health', (_req, res) => res.json({ ok: true, telegram: !!telegram }));

  // الواجهات
  app.use('/api/auth', authRoutes(store));
  app.use('/api', courseRoutes(store));
  app.use('/api', progressRoutes(store));
  app.use('/api', examRoutes(store));
  app.use('/api', noteRoutes(store));
  app.use('/api', codeRoutes(store));
  app.use('/api', topStudentsRoutes(store));
  app.use('/api/admin', adminRoutes(store));

  // الواجهة الأمامية المبنية (production) — تُخدم من نفس الخادم
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // معالج الأخطاء العام
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server] خطأ:', err);
    res.status(500).json({ error: err?.message || 'خطأ في الخادم' });
  });

  app.listen(config.port, () => {
    console.log(`\n🚀 DR Code API يعمل على http://localhost:${config.port}`);
    console.log(`   الواجهة الأمامية: http://localhost:5173\n`);
  });
}

main().catch((e) => {
  console.error('[server] فشل الإقلاع:', e);
  process.exit(1);
});
