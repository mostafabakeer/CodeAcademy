import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { config } from '../config';
import type { Request, Response, NextFunction } from 'express';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const videoExts = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'];
const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function makeStorage() {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = path.basename(file.originalname, ext).replace(/[^\w\u0600-\u06FF-]+/g, '-').slice(0, 40);
      cb(null, `${Date.now()}-${safeName}${ext}`);
    },
  });
}

function fileFilter(kind: 'video' | 'image') {
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = kind === 'video' ? videoExts.includes(ext) : imageExts.includes(ext);
    if (ok) cb(null, true);
    else cb(new Error(`نوع الملف غير مدعوم: ${ext}`));
  };
}

export const uploadVideo = multer({
  storage: makeStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
  fileFilter: fileFilter('video'),
});

export const uploadImage = multer({
  storage: makeStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: fileFilter('image'),
});

export function multerErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `خطأ في الرفع: ${err.message}` });
  }
  if (err) return res.status(400).json({ error: err.message || 'فشل الرفع' });
  next();
}
