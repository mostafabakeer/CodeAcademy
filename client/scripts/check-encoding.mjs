/**
 * كاشف النصوص المشوّرة (mojibake).
 *
 * السبب الشائع: ملف UTF-8 يُقرأ/يُحفظ بترميز Windows-1252 فيتحول «مثال» إلى
 * «Ù…Ø«Ø§Ù„». النتيجة تظهر للمستخدم كلغة غير مفهومة، ويصعب اكتشافها بالعين
 * لأن الملف يبدو صالحاً في بعض المحررات.
 *
 * المنطق: نجد أي تسلسل من حروف نطاق cp1252، ونحاول عكس التحويل (bytes → UTF-8).
 * لو نتج نص غير لاتيني سليم ⇒ الملف مشوّر. علامات التنصيص «» و— العربية
 * السليمة لا تتحول إلى UTF-8 صالح، فلا تُبلَّغ خطأً.
 */
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

const HIGH =
  '\\u0080-\\u00FF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC' +
  '\\u2013\\u2014\\u2018\\u2019\\u201A\\u201C\\u201D\\u201E\\u2020\\u2021\\u2022\\u2026' +
  '\\u2030\\u2039\\u203A\\u20AC\\u2122';
const RUN = new RegExp('[' + HIGH + ']{2,}', 'g');

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html', '.json', '.md', '.sql']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'pyodide',
  'py-engine',
  'coverage',
]);

function looksMojibake(run) {
  const bytes = Buffer.alloc(run.length);
  for (let i = 0; i < run.length; i++) {
    const cp = run.codePointAt(i);
    if (cp > 0xffff) return false;
    const b = CP1252[cp] !== undefined ? CP1252[cp] : cp;
    if (b > 0xff) return false;
    bytes[i] = b;
  }
  const decoded = bytes.toString('utf8');
  if (decoded.includes('\uFFFD') || decoded === run) return false;
  return /[^\u0000-\u02FF]/.test(decoded);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (EXTS.has(extname(entry))) yield full;
  }
}

const problems = [];
for (const file of walk(ROOT)) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!/[^\u0000-\u02FF]/.test(text) && !/[\u00C0-\u00FF]/.test(text)) continue;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(RUN)) {
      if (looksMojibake(match[0])) {
        problems.push(`${relative(ROOT, file)}:${index + 1}  ${match[0]}`);
        break;
      }
    }
  });
}

if (problems.length) {
  console.error(`✖ وُجد ${problems.length} سطراً بنص مشوّر (mojibake):`);
  for (const p of problems.slice(0, 40)) console.error('  ' + p);
  if (problems.length > 40) console.error(`  … و${problems.length - 40} سطراً آخر`);
  console.error('\nالحل: أعد حفظ الملف بترميز UTF-8، أو شغّل سكربت الإصلاح.');
  process.exit(1);
}

console.log('✔ الترميز سليم — لا توجد نصوص مشوّرة.');
