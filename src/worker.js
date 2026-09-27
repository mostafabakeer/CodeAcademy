/**
 * DR Code — Cloudflare Worker
 *
 * يقدّم ملفات `client/dist` (SPA) وي proxies طلبات /api/* إلى Supabase Edge Function
 * على **نفس الأصل (same-origin)**.
 *
 * لماذا البروكسي؟
 * الكوكي `dr_code_token` كوكي HttpOnly لـ supabase.co. لو طلبه المتصفح مباشرة
 * من نطاق الموقع ف Become طلباً من طرف ثالث، و Safari (iOS) و Chrome على
 * الموبايل يحجبان الكوكي من الطرف الثالث ⇒ الـ API يرى الطلب بلا توكن ⇒ 401
 * "unauthorized" على الموبايل بينما يعمل على الكمبيوتر.
 * عبر البروكسي يصبح الكوكي first-party للنطاق نفسه ⇒ يعمل على كل الأجهزة.
 */

const SUPABASE_FN_BASE =
  'https://hgeugcmockvnfenhljlc.supabase.co/functions/v1/api';

const API_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 250;
const MAX_ATTEMPTS = 3;

/** يزيل Domain من Set-Cookie حتى يصير الكوكي host-only لنطاق الموقع. */
function normalizeSetCookie(cookie) {
  return cookie
    .replace(/;\s*domain=[^;]*/gi, '')
    // نفس الموقع => Lax يكفي ويسمح بالطلبات من نافذة أخرى
    .replace(/;\s*samesite=none/i, '; SameSite=Lax');
}

/**
 * كوكيز بنية Cloudflare التحتية (__cf*) مرتبطة بإعداد supabase.co،
 * فنسخها إلى نطاقنا بلا فائدة وقد تربك المتصفح، فتُستبعد.
 * نُبقي كوكي المصادقة وكوكيز التطبيق فقط.
 */
function isRelayableCookie(cookie) {
  return !/^\s*__cf/i.test(cookie);
}

async function proxyApi(request, url) {
  // "/api/auth/me?x=1" ⇒ "/auth/me?x=1"
  const route = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const target = new URL(SUPABASE_FN_BASE + route);
  target.search = url.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  // ندعم الدالة المنشورة القديمة (x-path) والجديدة (المسار من الرابط)
  headers.set('x-path', route + url.search);
  headers.set('x-forwarded-host', url.host);

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  // إعادة المحاولة تصلح انقطاع الشبكة المؤقت، وهو شائع على الموبايل.
  // نقتصر على GET/HEAD لأن إعادة POST قد تُنفّذ مرتين.
  const idempotent = request.method === 'GET' || request.method === 'HEAD';
  const attempts = idempotent ? MAX_ATTEMPTS : 1;

  let upstream;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      upstream = await fetch(target.toString(), init);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }

  if (!upstream) {
    // لا نُخفي السبب: بدون هذا السطر يتحول أي فشل شبكي إلى 502 غامض يصعب تشخيصه
    console.warn(
      `[api-proxy] ${request.method} ${target.pathname} فشل بعد ${attempts} محاولة:`,
      lastError?.message || lastError,
    );
    return new Response(
      JSON.stringify({ error: 'تعذّر الوصول للخادم، حاول مجدداً' }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  const outHeaders = new Headers(upstream.headers);
  outHeaders.delete('set-cookie');
  outHeaders.delete('content-encoding');
  outHeaders.delete('content-length');
  const allCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [];
  const cookies = allCookies.filter(isRelayableCookie);
  for (const c of cookies) outHeaders.append('set-cookie', normalizeSetCookie(c));
  // نُخفي الكوكي عن الصفحة ونمنع التخزين المؤقت للاستجابات المصادَقة
  outHeaders.set('vary', 'Cookie, Origin');
  if (cookies.length) outHeaders.set('cache-control', 'private, no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1) طلبات الـ API تُروَّج عبر نفس الأصل قبل أي شيء آخر
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return proxyApi(request, url);
    }

    // Paths that should be served as static assets (not SPA routes)
    const staticPaths = [
      '/assets/',
      '/sw.js',
      '/workbox-',
      '/manifest.webmanifest',
      '/logo.png',
      '/favicon.ico',
      '/pwa-192.png',
      '/pwa-512.png',
      '/pwa-maskable-512.png',
      '/login-hero.png',
      '/owner.png',
    ];

    const isStaticPath = staticPaths.some(p => pathname.startsWith(p));

    // Try to serve the asset first
    const assetResponse = await env.ASSETS.fetch(request);

    // If asset found (not 404), return it
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    // If it's a static path but not found, return the 404
    if (isStaticPath) {
      return assetResponse;
    }

    // For all other paths (SPA routes), serve index.html
    const indexUrl = new URL('/index.html', request.url);
    const indexRequest = new Request(indexUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: request.redirect,
    });
    return env.ASSETS.fetch(indexRequest);
  },
};
