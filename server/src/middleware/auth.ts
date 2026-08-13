import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { loadEnv } from '../config/env';
import * as userService from '../services/userService';

export interface AuthUser {
  id: number;
  role: 'student' | 'admin';
  fullName: string;
  phone: string;
  grade: string;
  blocked?: boolean;
  subscription?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, loadEnv().jwtSecret, { expiresIn: '30d' });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), loadEnv().jwtSecret) as AuthUser;
    // نقرأ الحالة الحالية من قاعدة البيانات (حظر / اشتراك) حتى تكون القرارات فورية
    const user = await userService.getById(decoded.id);
    if (user) {
      if (user.blocked) {
        return res.status(403).json({ error: 'تم حظر حسابك من قبل إدارة الموقع' });
      }
      decoded.role = user.role === 'admin' ? 'admin' : 'student';
      decoded.grade = user.grade ?? decoded.grade;
      decoded.fullName = user.fullName;
      decoded.phone = user.phone;
      decoded.blocked = !!user.blocked;
      decoded.subscription = !!user.subscription;
    }
    (req as AuthRequest).user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthRequest).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin only' });
  }
  next();
}

/**
 * يمنع الطالب غير المشترك من الوصول إلى المحتوى (دورات/دروس/امتحانات/مذكرات/كود).
 * الأدمن دائماً مسموح.
 */
export function requireSubscriber(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthRequest).user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role === 'admin') return next();
  if (!user.subscription) {
    return res.status(403).json({ error: 'يجب تفعيل اشتراكك للوصول إلى المحتوى. تواصل مع إدارة الموقع واتساب: 01068633486' });
  }
  next();
}
