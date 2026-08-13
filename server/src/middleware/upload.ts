import path from 'node:path';
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';

const videoExts = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'];
const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// حد عملي: Supabase المجاني ~50MB لكل ملف. الفيديوهات الكبيرة يُنصح بنقلها لـ YouTube.
const VIDEO_MAX = 50 * 1024 * 1024; // 50MB
const IMAGE_MAX = 15 * 1024 * 1024;  // 15MB

function fileFilter(kind: 'video' | 'image') {
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = kind === 'video' ? videoExts.includes(ext) : imageExts.includes(ext);
    if (ok) cb(null, true);
    else cb(new Error(`نوع الملف غير مدعوم: ${ext}`));
  };
}

// الذاكرة بدلاً من القرص — نرفع مباشرة إلى Supabase Storage
export const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX },
  fileFilter: fileFilter('video'),
});

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX },
  fileFilter: fileFilter('image'),
});

export function multerErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'حجم الملف أكبر من المسموح (فيديو حتى 50MB، صورة حتى 15MB). الفيديوهات الكبيرة يُنصح برفعها على YouTube' });
    }
    return res.status(400).json({ error: `خطأ في الرفع: ${err.message}` });
  }
  if (err) return res.status(400).json({ error: err.message || 'فشل الرفع' });
  next();
}
