/**
 * ترحيل البيانات من server/data/db.json إلى Supabase.
 * يُشغَّل: npm run migrate (من داخل server/)
 *
 * يحافظ على الـ IDs القديمة ثم يضبط عدادات التسلسل لكل جدول.
 * خيارات:
 *   --upload-files  يرفع ملفات server/uploads إلى bucket images ويعيد كتابة روابط /uploads/...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../db/supabase';
import { loadEnv } from '../config/env';
import { initTelegram, mirrorCodeFile } from '../services/telegramService';
import { uploadFile } from '../services/uploadService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '../../data/db.json');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const UPLOAD_FILES = process.argv.includes('--upload-files');

const sb = getSupabase();

function normPhone(p: any): string {
  return String(p ?? '').replace(/[\s-]/g, '');
}

async function insertAll(table: string, rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await sb.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
  return rows.length;
}

async function resetSequence(table: string): Promise<void> {
  const { error } = await sb.rpc('_dr_reset_seq', { tbl: table });
  if (error) {
    console.warn(`[migrate] تعذّر إعادة ضبط تسلسل ${table}: ${error.message} — اضبطه يدوياً إن لزم.`);
  }
}

/** يعيد كتابة روابط /uploads/... المحلية إلى روابط Supabase بعد رفع الملفات. */
async function rewriteLocalUploadUrls(value: any): Promise<any> {
  if (typeof value !== 'string') return value;
  if (!value.startsWith('/uploads/')) return value;
  const rel = value.replace(/^\/uploads\//, '');
  const localPath = path.join(UPLOADS_DIR, path.basename(rel));
  if (!fs.existsSync(localPath)) return value;
  const stat = fs.statSync(localPath);
  const buffer = fs.readFileSync(localPath);
  const mime = stat.size > 0 ? guessMime(localPath) : 'application/octet-stream';
  const out = await uploadFile(loadEnv().bucketImages, {
    originalname: path.basename(localPath),
    buffer,
    mimetype: mime,
  } as Express.Multer.File);
  return out.url;
}

function guessMime(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

async function main(): Promise<void> {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`[migrate] لا يوجد ${DATA_FILE} — لا شيء للترحيل`);
    process.exit(1);
  }

  console.log(`[migrate] قراءة ${DATA_FILE} ...`);
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as { records: Record<string, any>; meta?: Record<string, any> };
  const records = raw.records ?? {};
  const summary: Record<string, number> = {};

  // تهيئة تيليجرام حتى تُعكس ملفات الكود مباشرة أثناء الترحيل (إن توفر)
  await initTelegram();

  // ===== 1) المستخدمون =====
  const users = Object.entries(records)
    .filter(([k]) => k.startsWith('user:'))
    .map(([k, v]) => ({
      id: v.id,
      full_name: v.fullName ?? '',
      username: v.username ?? null,
      phone: normPhone(v.phone),
      grade: v.grade ?? 'all',
      role: v.role === 'admin' ? 'admin' : 'student',
      subscription: !!v.subscription,
      blocked: !!v.blocked,
      password_hash: v.passwordHash ?? '',
      created_at: v.createdAt ?? Date.now(),
    }));
  summary.users = await insertAll('users', users);
  console.log(`[migrate] users: ${summary.users}`);

  // ===== 2) الكورسات =====
  const courses = Object.entries(records)
    .filter(([k]) => k.startsWith('course:'))
    .map(([, v]) => ({
      id: v.id,
      title: v.title ?? '',
      title_en: v.titleEn ?? '',
      description: v.description ?? '',
      description_en: v.descriptionEn ?? '',
      image: v.image ?? '',
      grade: v.grade ?? 'all',
      order: v.order ?? 0,
      created_at: v.createdAt ?? Date.now(),
    }));
  summary.courses = await insertAll('courses', courses);
  console.log(`[migrate] courses: ${summary.courses}`);

  // ===== 3) الدروس =====
  const lessons = Object.entries(records)
    .filter(([k]) => k.startsWith('lesson:'))
    .map(([, v]) => ({
      id: v.id,
      course_id: v.courseId ?? null,
      title: v.title ?? '',
      title_en: v.titleEn ?? '',
      video_type: v.videoType ?? 'youtube',
      video_url: v.videoUrl ?? '',
      duration: v.duration ?? 0,
      description: v.description ?? '',
      description_en: v.descriptionEn ?? '',
      grade: v.grade ?? 'all',
      order: v.order ?? 0,
      created_at: v.createdAt ?? Date.now(),
    }));
  summary.lessons = await insertAll('lessons', lessons);
  console.log(`[migrate] lessons: ${summary.lessons}`);

  // ===== 4) الامتحانات =====
  const exams = Object.entries(records)
    .filter(([k]) => k.startsWith('exam:'))
    .map(([, v]) => ({
      id: v.id,
      course_id: v.courseId ?? null,
      title: v.title ?? '',
      title_en: v.titleEn ?? '',
      time_limit: v.timeLimit ?? null,
      passing_score: v.passingScore ?? 50,
      grade: v.grade ?? 'all',
      allow_retake: !!v.allowRetake,
      order: v.order ?? 0,
      created_at: v.createdAt ?? Date.now(),
    }));
  summary.exams = await insertAll('exams', exams);
  console.log(`[migrate] exams: ${summary.exams}`);

  // ===== 5) الأسئلة =====
  const questions = Object.entries(records)
    .filter(([k]) => k.startsWith('question:'))
    .map(([, v]) => ({
      id: v.id,
      exam_id: v.examId ?? null,
      text: v.text ?? '',
      text_en: v.textEn ?? '',
      options: v.options ?? [],
      correct_index: v.correctIndex ?? 0,
      image: v.image ?? '',
      order: v.order ?? 0,
    }));
  summary.questions = await insertAll('questions', questions);
  console.log(`[migrate] questions: ${summary.questions}`);

  // ===== 6) المذكرات =====
  const notes = [];
  for (const [, v] of Object.entries(records).filter(([k]) => k.startsWith('note:'))) {
    const image = UPLOAD_FILES ? await rewriteLocalUploadUrls(v.image ?? '') : (v.image ?? '');
    notes.push({
      id: v.id,
      course_id: v.courseId ?? null,
      title: v.title ?? '',
      title_en: v.titleEn ?? '',
      body: v.body ?? '',
      body_en: v.bodyEn ?? '',
      image,
      grade: v.grade ?? 'all',
      order: v.order ?? 0,
      created_at: v.createdAt ?? Date.now(),
    });
  }
  summary.notes = await insertAll('notes', notes);
  console.log(`[migrate] notes: ${summary.notes}`);

  // ===== 7) أوائل الطلبة =====
  const topStudents = Object.entries(records)
    .filter(([k]) => k.startsWith('top:'))
    .map(([, v]) => ({
      id: v.id,
      name: v.name ?? '',
      image: v.image ?? '',
      rank: v.rank ?? 1,
      grade: v.grade ?? 'bac1',
      created_at: v.createdAt ?? Date.now(),
    }));
  summary.topStudents = await insertAll('top_students', topStudents);
  console.log(`[migrate] top_students: ${summary.topStudents}`);

  // ===== 8) التقدم =====
  const progress = Object.entries(records)
    .filter(([k]) => k.startsWith('progress:'))
    .map(([, v]) => ({
      user_id: v.userId,
      lesson_id: v.lessonId,
      seconds_watched: v.secondsWatched ?? 0,
      completed: !!v.completed,
      updated_at: v.updatedAt ?? Date.now(),
    }));
  summary.progress = await insertAll('progress', progress);
  console.log(`[migrate] progress: ${summary.progress}`);

  // ===== 9) نتائج الامتحانات =====
  const results = Object.entries(records)
    .filter(([k]) => k.startsWith('result:'))
    .map(([, v]) => ({
      user_id: v.userId,
      exam_id: v.examId,
      best: v.best ?? 0,
      score: v.score ?? 0,
      correct: v.correct ?? 0,
      total: v.total ?? 0,
      attempts: v.attempts ?? 0,
      answers: v.answers ?? {},
      history: v.history ?? [],
      at: v.at ?? Date.now(),
    }));
  summary.results = await insertAll('exam_results', results);
  console.log(`[migrate] exam_results: ${summary.results}`);

  // ===== 10) ملفات الكود =====
  const codeRows = Object.entries(records).filter(([k]) => k.startsWith('code:'));
  for (const [, v] of codeRows) {
    const row: any = {
      id: v.id,
      user_id: v.userId,
      name: v.name ?? 'ملف جديد',
      language: v.language ?? 'javascript',
      code: v.code ?? '',
      versions: v.versions ?? [],
      telegram_meta: null,
      created_at: v.createdAt ?? Date.now(),
      updated_at: v.updatedAt ?? Date.now(),
    };
    const { error } = await sb.from('code_files').insert(row);
    if (error) {
      console.warn(`[migrate] فشل ترحيل ملف الكود ${v.id}: ${error.message}`);
      continue;
    }
    // مرآة تيليجرام (إن توفرت) — نسخة احتياطية فقط
    const meta = await mirrorCodeFile({
      name: row.name,
      language: row.language,
      code: row.code,
      versions: row.versions,
      updatedAt: row.updated_at,
    });
    if (meta.msgId != null || meta.chunkIds?.length) {
      await sb.from('code_files').update({ telegram_meta: meta }).eq('id', v.id);
    }
  }
  summary.codeFiles = codeRows.length;
  console.log(`[migrate] code_files: ${summary.codeFiles}`);

  // ===== 11) الإعدادات =====
  const cfg = records['config:levels'];
  if (cfg) {
    await sb.from('app_config').upsert({ key: 'levels', value: cfg }, { onConflict: 'key' });
    summary.config = 1;
    console.log('[migrate] app_config: 1');
  } else {
    summary.config = 0;
    console.log('[migrate] app_config: 0');
  }

  // ===== ضبط العدادات =====
  const seqTables = ['users', 'courses', 'lessons', 'exams', 'questions', 'notes', 'top_students', 'code_files'];
  for (const t of seqTables) {
    await resetSequence(t);
  }
  console.log('[migrate] تم ضبط عدادات التسلسل للجداول ذات IDs');

  console.log('\n===== ملخص الترحيل =====');
  console.table(summary);
  console.log('\nتم الترحيل بنجاح ✅');
}

main().catch((e) => {
  console.error('[migrate] فشل:', e);
  process.exit(1);
});
