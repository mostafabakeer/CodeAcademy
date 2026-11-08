/**
 * يضغط الصور الثقيلة إلى WebP (تحسين سرعة التحميل).
 * تشغيل يدوي عند تغيير الصور: `npm run images`
 * الناتج يُحفظ بجانب الأصل، والأصل يبقى كمرجع/احتياط.
 */
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');

const jobs = [
  { src: 'login-hero.png', out: 'login-hero.webp', width: 900, quality: 80 },
  { src: 'owner.png', out: 'owner.webp', width: 900, quality: 80 },
  { src: 'hero-highlight.jpg', out: 'hero-highlight.webp', width: 900, quality: 80 },
  { src: 'logo.png', out: 'logo.webp', width: 512, quality: 90 },
];

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

for (const job of jobs) {
  const input = join(pub, job.src);
  const output = join(pub, job.out);
  const before = (await stat(input)).size;
  await sharp(input)
    .resize({ width: job.width, withoutEnlargement: true })
    .webp({ quality: job.quality, effort: 5 })
    .toFile(output);
  const after = (await stat(output)).size;
  console.log(`${job.src} ${kb(before)} → ${job.out} ${kb(after)} (${Math.round((1 - after / before) * 100)}% أصغر)`);
}
