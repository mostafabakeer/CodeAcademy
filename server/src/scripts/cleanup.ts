/**
 * تنظيف دوري:
 *  - code_files: تقليم إصدارات الكود لأحدث 20 إصدار (مع إعادة عكس المرآة عند التقليم).
 *  - exam_results: تقليم history لأحدث 20 محاولة.
 * يُشغَّل: npm run cleanup (من داخل server/)
 */
import { getSupabase } from '../db/supabase';
import { initTelegram, mirrorCodeFile } from '../services/telegramService';

const MAX_VERSIONS = 20;
const MAX_HISTORY = 20;

async function main(): Promise<void> {
  const sb = getSupabase();
  await initTelegram();
  let trimmedFiles = 0;
  let trimmedResults = 0;

  // ===== code_files =====
  const { data: files } = await sb.from('code_files').select('*');
  for (const f of files ?? []) {
    const versions = Array.isArray(f.versions) ? f.versions : [];
    if (versions.length > MAX_VERSIONS) {
      const kept = versions.slice(-MAX_VERSIONS);
      const update: any = { versions: kept };
      if (f.telegram_meta) {
        // إعادة عكس المرآة بعد التقليم حتى تبقى متطابقة
        const meta = await mirrorCodeFile(
          { name: f.name ?? '', language: f.language ?? 'javascript', code: f.code ?? '', versions: kept, updatedAt: f.updated_at ?? Date.now() },
          f.telegram_meta
        );
        update.telegram_meta = meta;
      }
      const { error } = await sb.from('code_files').update(update).eq('id', f.id);
      if (error) console.warn(`[cleanup] فشل تقليم ملف الكود ${f.id}: ${error.message}`);
      else {
        trimmedFiles++;
        console.log(`[cleanup] code_files ${f.id}: قُطعت الإصدارات إلى ${MAX_VERSIONS}`);
      }
    }
  }

  // ===== exam_results =====
  const { data: results } = await sb.from('exam_results').select('*');
  for (const r of results ?? []) {
    const history = Array.isArray(r.history) ? r.history : [];
    if (history.length > MAX_HISTORY) {
      const kept = history.slice(-MAX_HISTORY);
      const { error } = await sb
        .from('exam_results')
        .update({ history: kept })
        .eq('user_id', r.user_id)
        .eq('exam_id', r.exam_id);
      if (error) console.warn(`[cleanup] فشل تقليم history لنتيجة ${r.user_id}/${r.exam_id}: ${error.message}`);
      else {
        trimmedResults++;
        console.log(`[cleanup] exam_results ${r.user_id}/${r.exam_id}: قُطع history إلى ${MAX_HISTORY}`);
      }
    }
  }

  console.log(`\n[cleanup] انتهى: ${trimmedFiles} ملف كود، ${trimmedResults} نتيجة — لا تغيير إن كانت القيم ضمن الحدود.`);
}

main().catch((e) => {
  console.error('[cleanup] فشل:', e);
  process.exit(1);
});
