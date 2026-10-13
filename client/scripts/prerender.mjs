/**
 * Prerender للصفحات العامة إلى HTML ثابت داخل dist.
 *
 * - يخدم dist محلياً ويمرّر /api/* إلى Supabase Edge Function (نفس منطق الـ Worker)
 *   حتى تُبنى الصفحات الديناميكية ببيانات حقيقية وقت الالتقاط.
 * - يفتح سياق متصفح معزول لكل مسار (بلا Service Worker مشترك).
 * - fail-soft: لو تعذّر تحميل Puppeteer/Chromium يُطبع تحذير ويُكمل البناء.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', 'dist');
const SUPABASE = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function fileExists(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** يمرّر /api/* إلى Supabase بنفس منطق بروكسي الـ Worker. */
async function proxyApi(req, res, pathname, search) {
  if (!SUPABASE) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'no supabase url for prerender proxy' }));
    return;
  }
  const route = pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const target = `${SUPABASE}/functions/v1/api${route}${search}`;
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { 'x-path': route + search, accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'content-length': buf.length,
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}

/** خادم静态: يدعم الأصول، ثم <path>/index.html، ثم SPA fallback. */
async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/api' || pathname.startsWith('/api/')) {
        return proxyApi(req, res, pathname, url.search);
      }

      const candidates = [];
      if (pathname !== '/') candidates.push(join(distDir, pathname, 'index.html'));
      candidates.push(join(distDir, pathname));
      if (pathname === '/') candidates.push(join(distDir, 'index.html'));

      for (const candidate of candidates) {
        if (await fileExists(candidate)) {
          const body = await readFile(candidate);
          res.writeHead(200, { 'content-type': MIME[extname(candidate)] || 'application/octet-stream' });
          res.end(body);
          return;
        }
      }

      // SPA fallback
      const index = await readFile(join(distDir, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(index);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err?.message || err));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, origin: `http://127.0.0.1:${port}` };
}

async function fetchCoursePaths(origin) {
  try {
    const res = await fetch(`${origin}/api/public/courses`);
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.courses) ? data.courses : [];
    return list
      .filter((c) => c && (typeof c.id === 'number' || typeof c.id === 'string'))
      .map((c) => `/courses/${c.id}`);
  } catch {
    return [];
  }
}

async function main() {
  if (!existsSync(distDir)) {
    console.error('[prerender] dist مفقود — شغّل vite build أولاً.');
    process.exit(1);
  }

  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.warn('\n[prerender] ⚠ Puppeteer غير مثبّت — تم تخطي الـ prerender (البناء ناجح).');
    console.warn('[prerender]   للتشغيل: npm install (سيُنزّل Chromium تلقائياً).\n');
    return;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    console.warn('\n[prerender] ⚠ تعذّر تشغيل Chromium — تم تخطي الـ prerender (البناء ناجح).');
    console.warn(`[prerender]   ${err?.message || err}\n`);
    return;
  }

  const { server, origin } = await startServer();
  const routes = ['/', '/courses', '/top-students', '/login', '/register', ...(await fetchCoursePaths(origin))];
  const unique = [...new Set(routes)];

  let ok = 0;
  try {
    for (const route of unique) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      try {
        // 'load' لا 'networkidle0': التطبيق قد يُبقي اتصالات مفتوحة فيعلّق البناء.
        await page.goto(`${origin}${route}`, { waitUntil: 'load', timeout: 20_000 });
        // ننتظر تركيب التطبيق ثم كتابة وسوم SEO (تحدث داخل useEffect).
        await page
          .waitForFunction(() => (document.querySelector('#root')?.childElementCount ?? 0) > 0, { timeout: 15_000 })
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        const html = await page.content();
        const outPath = route === '/' ? join(distDir, 'index.html') : join(distDir, route, 'index.html');
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, html, 'utf8');
        ok++;
        console.log(`[prerender] ✓ ${route}`);
      } catch (err) {
        console.warn(`[prerender] ✗ ${route}: ${err?.message || err}`);
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`[prerender] تم توليد ${ok}/${unique.length} صفحة.`);
}

main().catch((err) => {
  console.warn(`[prerender] ⚠ فشل غير متوقع (تم تجاهله): ${err?.message || err}`);
});
