import { getLocal, setLocal, removeLocal } from './storage';

// ===== طبقة كاش عامة (TTL) فوق localStorage =====

const CACHE_PREFIX = 'cache:';

interface CacheEntry<T> {
  at: number;
  data: T;
}

export function getCached<T>(key: string, ttlMs: number): T | null {
  const raw = getLocal(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > ttlMs) {
      // لا نحذف المدخل المنتهي: `getCachedStale` يعيده عند فشل الشبكة،
      // وحذفه هنا كان يجعل الموقع يفقد بياناته بالكامل بعد انقطاع الإنترنت.
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * عمر المدخل بالمللي ثانية (0 = الآن)، أو null إن لم يوجد مدخل صالح البنية.
 * يسمح للواجهة بمعرفة هل البيانات حديثة بما يكفي قبل إطلاق طلب شبكة.
 */
export function getCachedAge(key: string): number | null {
  const raw = getLocal(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<unknown>;
    if (typeof parsed.at !== 'number') return null;
    return Math.max(0, Date.now() - parsed.at);
  } catch {
    return null;
  }
}

/** قراءة الكاش حتى لو انتهت صلاحيته — بدون حذفه — لاستخدامه كـ"آخر بيانات معروفة" عند فشل الشبكة. */
export function getCachedStale<T>(key: string): T | null {
  const raw = getLocal(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed.at !== 'number') return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { at: Date.now(), data };
  setLocal(CACHE_PREFIX + key, JSON.stringify(entry));
}

export function removeCached(key: string): void {
  removeLocal(CACHE_PREFIX + key);
}
