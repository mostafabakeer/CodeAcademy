import { getAuthUser } from '../_shared/auth.ts';
import { cleanupData } from '../_shared/db.ts';
import { json, corsHeaders } from '../_shared/responses.ts';

/**
 * تنظيف دوري:
 *  - code_files: تقليم إصدارات الكود لأحدث 20 إصدار (مع إعادة عكس المرآة).
 *  - exam_results: تقليم history لأحدث 20 محاولة.
 * يتطلب أدمن. يمكن جدولته عبر Supabase Cron (pg_cron) بالاستدعاء مع JWT أدمن.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  // التنظيف يُستدعى فقط من أدوات/سكربتات (لا من المتصفح): نرفض أي طلب يحمل Origin.
  if (req.headers.get('origin')) return json({ error: 'Forbidden: server-side only' }, 403, req);

  const user = await getAuthUser(req);
  if (!user) return json({ error: 'Unauthorized' }, 401, req);
  if (user.role !== 'admin') return json({ error: 'Forbidden: admin only' }, 403, req);

  try {
    const result = await cleanupData();
    return json({ ok: true, ...result }, 200, req);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, req);
  }
});
