/**
 * أدوات روابط يوتيوب.
 *
 * الدوال هنا نقية ومطابقة لنسخة الخادم في
 * `supabase/functions/_shared/youtube.ts` — لو عدّلت واحدة عدّل الأخرى.
 * (العميل والـ edge functions منفصلان، فالنسخ inevitable.)

/** معرّف فيديو يوتيوب: 11 حرفًا من [A-Za-z0-9_-]. */
const YT_ID = /^[\w-]{11}$/;

/** نطاقات يوتيوب المعروفة (يشمل m./music./nocookie.). */
const YT_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

/** المسارات اللي الـ ID بيكون بعدها مباشرة (بعد استثناء watch?v=). */
const YT_PATHS = ['embed', 'shorts', 'live', 'v'];

/**
 * يستخرج معرّف فيديو يوتيوب من أي صيغة رابط شائعة، أو من ID مجرّد.
 *
 * مدعوم:
 *  - `https://www.youtube.com/watch?v=ID` (وكذلك m. / music. / nocookie.)
 *  - `https://www.youtube.com/watch?app=desktop&v=ID` (الـ v في أي موضع)
 *  - `https://youtu.be/ID` · `/embed/ID` · `/shorts/ID` · `/live/ID` · `/v/ID`
 *  - `youtube.com/watch?v=ID` (بدون بروتوكول)
 *  - `ID` مجرّد (11 حرفًا)
 *
 * يرجع `null` لأي نص آخر (رابط MP4، رابط موقع تاني، نص عشوائي…).
 */
export function extractYouTubeId(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  // ID مجرّد — مهم للبيانات القديمة ونماذج الإدخال
  if (YT_ID.test(raw)) return raw;

  // نحاول الرابط كما هو، ثم بدون بروتوكول (نموذج "youtube.com/watch?v=ID")
  let url: URL | null = null;
  for (const candidate of raw.startsWith('//') ? [`https:${raw}`] : [raw, `https://${raw}`]) {
    try {
      url = new URL(candidate);
      break;
    } catch {
      /* جرّب الصيغة التالية */
    }
  }
  if (!url || !YT_HOST.test(url.hostname)) return null;

  // youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    const seg = url.pathname.split('/').filter(Boolean)[0];
    return seg && YT_ID.test(seg) ? seg : null;
  }

  // ?v=<id> في أي موضع
  const v = url.searchParams.get('v');
  if (v && YT_ID.test(v)) return v;

  // /embed/<id> · /shorts/<id> · /live/<id> · /v/<id>
  const seg = url.pathname.split('/').filter(Boolean);
  if (seg.length >= 2 && YT_PATHS.includes(seg[0].toLowerCase()) && YT_ID.test(seg[1])) {
    return seg[1];
  }

  return null;
}

/** هل هذا رابط يوتيوب صالح للتشغيل المدمج؟ */
export function isYouTubeUrl(input: string | null | undefined): boolean {
  return extractYouTubeId(input) !== null;
}

/** رابط المشغّل المدمج (nocookie = خصوصية أعلى للطلاب). */
export function buildYouTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
}

/** رابط المشاهدة على يوتيوب نفسه —Fallback عند رفض التشغيل المدمج. */
export function buildYouTubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

/** رابط المشاهدة لأي صيغة إدخال (يحوّل ID مجرّد أو رابط قصير إلى watch URL). */
export function buildYouTubeWatchUrlFrom(input: string): string | null {
  const id = extractYouTubeId(input);
  return id ? buildYouTubeWatchUrl(id) : null;
}

/**
 * يحوّل أي صيغة إدخال إلى الصيغة القياسية `watch?v=ID` للتخزين،
 * فتبقى البيانات نظيفة وقابلة للمقارنة. يرجع `null` لو الرابط غير صالح.
 */
export function canonicalizeYouTubeUrl(input: string | null | undefined): string | null {
  const id = extractYouTubeId(input);
  return id ? buildYouTubeWatchUrl(id) : null;
}
