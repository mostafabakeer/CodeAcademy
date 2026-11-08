/**
 * ينسخ ملفات Pyodide من node_modules إلى client/public/pyodide.
 *
 * لماذا الاستضافة الذاتية؟
 * - نفس الأصل ⇒ لا مشاكل CORS/حظر، وأسرع في مصر من CDN أجنبي.
 * - تعمل مع الـ PWA/الكاش طويل الأمد (immutable) بدل تحميل 10MB من طرف ثالث.
 *
 * الملفات لا تُحفظ في git (13MB ثنائيات) — تُنسخ تلقائياً قبل dev/build.
 * المصدر هو نفس إصدار الحزمة المثبّت، فلا يحدث عدم تطابق.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'node_modules', 'pyodide');
const outDir = join(here, '..', 'public', 'pyodide');

/** الحد الأدنى الذي يحتاجه Pyodide للعمل (النسخة "full" للويب). */
const FILES = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
];

if (!existsSync(srcDir)) {
  console.warn('[pyodide] node_modules/pyodide غير موجود — تخطّي نسخ الأصول (شغّل npm ci).');
  process.exit(0);
}

await mkdir(outDir, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const src = join(srcDir, file);
  const dest = join(outDir, file);
  if (!existsSync(src)) {
    console.warn(`[pyodide] ملف مفقود في الحزمة: ${file}`);
    continue;
  }
  const srcStat = await stat(src);
  let same = false;
  try {
    const destStat = await stat(dest);
    same = destStat.size === srcStat.size;
  } catch {
    same = false;
  }
  if (!same) {
    await copyFile(src, dest);
    copied++;
  }
}

const total = FILES.reduce((sum, f) => {
  try {
    return sum + 0; // الحجم الكلي غير مهم للّوج
  } catch {
    return sum;
  }
}, 0);
void total;

console.log(`[pyodide] ${copied ? `نُسخ ${copied} ملف` : 'الأصول محدّثة'} → ${outDir}`);
