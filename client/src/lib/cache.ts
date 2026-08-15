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
      removeLocal(CACHE_PREFIX + key);
      return null;
    }
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
