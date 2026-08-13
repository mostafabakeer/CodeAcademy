import path from 'node:path';
import { getSupabase } from '../db/supabase';
import { loadEnv } from '../config/env';
import { logger } from '../utils/logger';

/**
 * رفع الملفات إلى Supabase Storage (videos / images / backups).
 * الاستخدام من السيرفر فقط عبر service role key.
 */
function safeName(original: string): string {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext).replace(/[^\w\u0600-\u06FF-]+/g, '-').slice(0, 40);
  return `${Date.now()}-${base}${ext}`;
}

export async function ensureBuckets(): Promise<void> {
  const env = loadEnv();
  for (const bucket of [env.bucketVideos, env.bucketImages, env.bucketBackups]) {
    try {
      const { data } = await getSupabase().storage.getBucket(bucket);
      if (!data) {
        const { error } = await getSupabase().storage.createBucket(bucket, { public: true });
        if (error) logger.warn({ err: error.message, bucket }, '[storage] فشل إنشاء bucket');
        else logger.info(`[storage] تم إنشاء bucket: ${bucket}`);
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, bucket }, '[storage] تعذّر التحقق من bucket');
    }
  }
}

export interface UploadOutcome {
  url: string;
  path: string;
}

export async function uploadFile(bucket: string, file: Express.Multer.File): Promise<UploadOutcome> {
  const filePath = safeName(file.originalname);
  const { error } = await getSupabase().storage.from(bucket).upload(filePath, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error(`فشل الرفع إلى المخزن: ${error.message}`);

  const { data } = getSupabase().storage.from(bucket).getPublicUrl(filePath);
  return { url: data.publicUrl, path: filePath };
}

export function getPublicUrl(bucket: string, filePath: string): string {
  const { data } = getSupabase().storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function deleteFile(bucket: string, filePath: string): Promise<void> {
  const { error } = await getSupabase().storage.from(bucket).remove([filePath]);
  if (error) logger.warn({ err: error.message, bucket, filePath }, '[storage] فشل حذف ملف');
}
