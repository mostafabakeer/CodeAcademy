import { getAuthUser } from '../_shared/auth.ts';
import { exportAllToBackup } from '../_shared/db.ts';
import { BUCKET_BACKUPS } from '../_shared/env.ts';
import { json, corsHeaders } from '../_shared/responses.ts';

/**
 * نسخة احتياطية كاملة: يصدّر كل الجداول إلى JSON ويرفعه إلى bucket backups.
 * يتطلب أدمن — استدعاء من لوحة الأدمن أو سكربت خارجي بـ JWT.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  // النسخ الاحتياطي يُستدعى فقط من أدوات/سكربتات (لا من المتصفح): نرفض أي طلب يحمل Origin.
  if (req.headers.get('origin')) return json({ error: 'Forbidden: server-side only' }, 403, req);

  const user = await getAuthUser(req);
  if (!user) return json({ error: 'Unauthorized' }, 401, req);
  if (user.role !== 'admin') return json({ error: 'Forbidden: admin only' }, 403, req);

  try {
    const result = await exportAllToBackup(BUCKET_BACKUPS);
    return json({ ok: true, ...result }, 200, req);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, req);
  }
});
