import { Router } from 'express';
import type { Response } from 'express';
import type { AppStore } from '../db/store';
import { signToken, requireAuth, type AuthRequest } from '../middleware/auth';
import { hashPassword, verifyPassword } from '../utils/password';
import { computeStudentStats } from '../utils/levels';

export const GRADES: Record<string, { name: string; nameEn: string }> = {
  bac1: { name: 'أولى باكلوريه', nameEn: '1st Baccalaureate' },
  bac2: { name: 'تانية باكلوريه', nameEn: '2nd Baccalaureate' },
};

function sanitizeUser(u: any) {
  if (!u) return u;
  const { passwordHash, ...safe } = u;
  return safe;
}

export function authRoutes(store: AppStore): Router {
  const r = Router();

  r.post('/register', async (req, res: Response) => {
    try {
      const { fullName, phone, grade, password } = req.body ?? {};
      if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 3) {
        return res.status(400).json({ error: 'الاسم الكامل مطلوب (3 أحرف على الأقل)' });
      }
      if (!phone || !/^[0-9+\s-]{8,15}$/.test(String(phone))) {
        return res.status(400).json({ error: 'رقم التليفون غير صحيح' });
      }
      if (!grade || !GRADES[grade]) {
        return res.status(400).json({ error: 'الصف الدراسي غير صحيح' });
      }
      if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      }

      const normPhone = String(phone).replace(/[\s-]/g, '');
      const users = await store.all<any>('user:');
      if (users.some((u) => String(u.value.phone).replace(/[\s-]/g, '') === normPhone)) {
        return res.status(400).json({ error: 'رقم التليفون مسجل بالفعل' });
      }

      const isFirstUser = users.length === 0;
      const id = await store.nextId();
      const passwordHash = await hashPassword(String(password));
      const role = isFirstUser ? 'admin' : 'student';
      const user = {
        id,
        fullName: fullName.trim(),
        phone: normPhone,
        grade,
        role,
        subscription: role === 'admin',
        blocked: false,
        createdAt: Date.now(),
        passwordHash,
      };
      await store.set(`user:${id}`, user);
      if (isFirstUser) console.log(`[auth] أول مستخدم سجل = أدمن (${user.fullName})`);

      const safe = sanitizeUser(user);
      res.json({ token: signToken({ id, role: user.role === 'admin' ? 'admin' : 'student', fullName: user.fullName, phone: user.phone, grade: user.grade }), user: safe });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.post('/login', async (req, res: Response) => {
    try {
      const { identifier, password } = req.body ?? {};
      if (!identifier || !password) return res.status(400).json({ error: 'التليفون وكلمة المرور مطلوبان' });

      const norm = String(identifier).replace(/[\s-]/g, '');
      const users = await store.all<any>('user:');
      const user = users.find(
        (u) => String(u.value.phone).replace(/[\s-]/g, '') === norm || String(u.value.username ?? '') === String(identifier)
      )?.value;

      if (!user || !(await verifyPassword(String(password), user.passwordHash))) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      }
      if (user.blocked) {
        return res.status(403).json({ error: 'تم حظر حسابك من قبل إدارة الموقع. تواصل مع الإدارة واتساب: 01068633486' });
      }

      const safe = sanitizeUser(user);
      res.json({ token: signToken({ id: user.id, role: user.role === 'admin' ? 'admin' : 'student', fullName: user.fullName, phone: user.phone, grade: user.grade }), user: safe });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  r.get('/me', requireAuth, async (req, res: Response) => {
    try {
      const uid = (req as AuthRequest).user!.id;
      const user = await store.get(`user:${uid}`);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      const stats = await computeStudentStats(store, uid);
      res.json({ user: sanitizeUser(user), stats });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
