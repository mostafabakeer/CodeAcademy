/**
 * نسخة احتياطية كاملة: يصدّر كل الجداول إلى JSON ويرفعه إلى bucket backups باسم مؤرخ.
 * يُشغَّل: npm run backup (من داخل server/)
 * يُنصح بجدولته دورياً (cron) على الخادم.
 */
import { exportAll } from '../services/backupService';

async function main(): Promise<void> {
  console.log('[backup] بدء تصدير قاعدة البيانات...');
  const result = await exportAll();
  console.log(`[backup] تم بنجاح ✅`);
  console.log(`  الملف: ${result.fileName}`);
  console.log(`  الحجم: ${(result.size / 1024).toFixed(1)} KB`);
  console.log(`  الرابط: ${result.url}`);
}

main().catch((e) => {
  console.error('[backup] فشل:', e);
  process.exit(1);
});
