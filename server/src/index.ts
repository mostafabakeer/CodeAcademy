import { loadEnv } from './config/env';
import { getSupabase } from './db/supabase';
import { logger } from './utils/logger';
import { initTelegram } from './services/telegramService';
import { ensureBuckets } from './services/uploadService';
import { seedIfNeeded } from './services/configService';
import { createApp } from './app';

async function main() {
  const env = loadEnv();
  logger.info('جاري تشغيل DR Code API...');

  // تحقق سريع من الاتصال بـ Supabase
  const sb = getSupabase();
  const { error: healthError } = await sb.from('app_config').select('key').limit(1);
  if (healthError) {
    logger.error({ err: healthError.message }, '[supabase] تعذّر الاتصال بقاعدة البيانات');
    process.exit(1);
  }
  logger.info('[supabase] متصل بقاعدة البيانات');

  // طبقة تيليجرام (مرآة الكود الاحتياطية)
  await initTelegram();

  // تأكد من وجود الـ buckets (videos / images / backups)
  await ensureBuckets();

  // Seed اختياري — يعمل فقط عند الطلب (SEED_ON_START=true)
  if (env.seedOnStart) {
    await seedIfNeeded();
  }

  const app = createApp(env);

  app.listen(env.port, () => {
    logger.info(`🚀 DR Code API يعمل على http://localhost:${env.port}`);
  });
}

main().catch((e) => {
  logger.error({ err: (e as Error).message }, '[server] فشل الإقلاع');
  process.exit(1);
});
