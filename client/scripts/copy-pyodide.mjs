/**
 * ينسخ ملفات Pyodide من node_modules إلى client/public/pyodide/<version>.
 *
 * لماذا الاستضافة الذاتية؟
 * - نفس الأصل ⇒ لا مشاكل CORS/حظر، وأسرع في مصر من CDN أجنبي.
 * - تعمل مع كاش طويل الأمد بدل تحميل 10MB من طرف ثالث.
 *
 * لماذا مجلد برقم الإصدار؟
 * - لأن `_headers` يضع كاش 30 يوماً على `/pyodide/*`. حين نقصت الأصول سابقاً
 *   خزّن المتصفح ردود 404 لنفس المسارات، فكان الإصلاح لن يظهر لبعض المستخدمين.
 *   مسار جديد (`/pyodide/0.26.4/`) يتجاوز أي 404 قديم مخزَّن.
 *
 * الملفات لا تُحفظ في git (13MB ثنائيات) — تُنسخ تلقائياً قبل dev/build.
 * المصدر هو نفس إصدار الحزمة المثبّت، فلا يحدث عدم تطابق.
 */
import { copyFile, mkdir, rm, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** يجب أن يطابق الثابت في client/src/lib/pythonRunner.ts */
const EXPECTED_VERSION = '0.26.4';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'node_modules', 'pyodide');
const publicDir = join(here, '..', 'public', 'pyodide');

/** الحد الأدنى الذي يحتاجه Pyodide للعمل (النسخة "full" للويب). */
const FILES = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
];

function fail(message) {
  console.error(`[pyodide] ✗ ${message}`);
  process.exit(1);
}

if (!existsSync(srcDir)) {
  fail(
    'node_modules/pyodide غير موجود. شغّل "npm ci" أولاً. ' +
      'رفض النشر بلا محرك Python أفضل من نشر موقع يقول للطلاب "تعذّر تجهيز المحرك".',
  );
}

const pkgPath = join(srcDir, 'package.json');
if (!existsSync(pkgPath)) fail('node_modules/pyodide تالف (package.json مفقود).');

const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
const version = String(pkg.version ?? '');
if (version !== EXPECTED_VERSION) {
  fail(
    `إصدار pyodide المثبّت (${version || 'غير معروف'}) لا يطابق المسار المتوقع ` +
      `(${EXPECTED_VERSION}). حدّث PYODIDE_VERSION في pythonRunner.ts وهذا الملف معاً.`,
  );
}

for (const file of FILES) {
  if (!existsSync(join(srcDir, file))) fail(`ملف مفقود في حزمة pyodide: ${file}`);
}

const outDir = join(publicDir, version);
await mkdir(outDir, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const src = join(srcDir, file);
  const dest = join(outDir, file);
  const srcStat = await stat(src);
  let same = false;
  try {
    same = (await stat(dest)).size === srcStat.size;
  } catch {
    same = false;
  }
  if (!same) {
    await copyFile(src, dest);
    copied++;
  }
  // تحقّق بعد النسخ: ملف فارغ/ناقص = نشر مكسور.
  const destSize = (await stat(dest)).size;
  if (destSize !== srcStat.size) {
    fail(`نسخ ${file} فشل (المصدر ${srcStat.size} بايت، الهدف ${destSize} بايت).`);
  }
}

// إزالة النسخة المسطّحة القديمة (public/pyodide/*.js) حتى لا تُنشر 13MB مكرّرة.
for (const file of FILES) {
  const stale = join(publicDir, file);
  if (existsSync(stale)) await rm(stale, { force: true });
}

console.log(
  `[pyodide] ${copied ? `نُسخ ${copied} ملف` : 'الأصول محدّثة'} → ${outDir}`,
);
