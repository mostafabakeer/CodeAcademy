import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bootstrapAgeMs,
  getBootstrapSync,
  loadBootstrap,
  MEMORY_CACHE_TTL,
  type BootstrapData,
} from './content';
import { useToastStore } from '../store/toastStore';

/** بعد هذه المدة نعتبر المحتوى قديماً بما يكفي للتحديث في الخلفية. */
const REFRESH_AFTER_MS = MEMORY_CACHE_TTL;

export interface BootstrapState {
  data: BootstrapData | null;
  reloading: boolean;
  error: string | null;
  retry: () => void;
  isSyncing: boolean;
  lastSyncAt: number | null;
}

/**
 * محتوى المستخدم مع استمرارية كاملة بعد إعادة التحميل:
 * - القيمة الابتدائية تأتي فورًا من آخر نسخة محفوظة (localStorage) حتى لو انتهت صلاحيتها.
 * - ثم يُحدَّث من الشبكة في الخلفية دون إفراغ الصفحة.
 * - فشل التحديث لا يمسح البيانات — يُعاد الخطأ فقط ليُعرض بتنبيه مع إعادة محاولة.
 * - يدعم المزامنة الفورية عبر Polling/Realtime.
 */
export function useBootstrapData(userId: number | null | undefined): BootstrapState {
  const [data, setData] = useState<BootstrapData | null>(() => (userId != null ? getBootstrapSync(userId) : null));
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const idRef = useRef<number | null | undefined>(userId);
  const abortRef = useRef<AbortController | null>(null);
  const syncUnsubscribeRef = useRef<(() => void) | null>(null);
  const toast = useToastStore((s) => s.push);

  const run = useCallback(
    (force: boolean) => {
      if (userId == null) return;

      // إلغاء الطلب السابق إذا كان قيد التنفيذ
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      setReloading(true);
      loadBootstrap(userId, force, abortRef.current.signal)
        .then((b) => {
          if (idRef.current === userId && !abortRef.current?.signal.aborted) {
            setData(b);
            setError(null);
            if (!force) setIsSyncing(false);
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return; // تجاهل الإلغاء
          if (idRef.current !== userId) return;
          setError(err instanceof Error ? err.message : 'تعذّر تحديث المحتوى');
          if (!force) setIsSyncing(false);
        })
        .finally(() => {
          if (idRef.current === userId) setReloading(false);
        });
    },
    [userId]
  );

  // دمج تحديثات المزامنة في الكاش
  const handleContentChange = useCallback(
    (entity: string) => {
      if (userId == null) return;

      // إلغاء bootstrap cache القديم وجلب جديد
      setIsSyncing(true);

      // loadBootstrap مع force=true يجلب أحدث البيانات
      loadBootstrap(userId, true)
        .then((b) => {
          if (idRef.current === userId) {
            setData(b);
            setError(null);
            setLastSyncAt(Date.now());
            setIsSyncing(false);

            // إظهار Toast صغير (اختياري - كل 30 ثانية كحد أقصى)
            const now = Date.now();
            const lastToast = (window as any).__lastContentSyncToast || 0;
            if (now - lastToast > 30_000) {
              (window as any).__lastContentSyncToast = now;
              toast('info', 'تم تحديث المحتوى');
            }
          }
        })
        .catch((err) => {
          if (idRef.current === userId) {
            setIsSyncing(false);
          }
        });
    },
    [userId, toast]
  );

  useEffect(() => {
    idRef.current = userId;
    if (userId == null) {
      setTimeout(() => {
        setData(null);
        setReloading(false);
        setError(null);
        setIsSyncing(false);
        setLastSyncAt(null);
      }, 0);
      return;
    }
    const sync = getBootstrapSync(userId);
    if (sync) {
      setTimeout(() => setData(sync), 0);
    }
    // لا نطلق طلب bootstrap عند كل mount: البيانات الحديثة (أقل من 30 دقيقة)
    // تُعرض فوراً بلا شبكة. الجلب يحدث فقط عند انتهاء صلاحيتها، أو عند العودة
    // للتبويب بعد انتهائها.
    const age = bootstrapAgeMs(userId);
    const fresh = sync !== null && age !== null && age < REFRESH_AFTER_MS;
    if (!fresh) {
      setTimeout(() => run(false), 0);
    }

    // تنظيف عند unmount
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [userId, run]);

  // الاشتراك في تغييرات المحتوى (Polling/Realtime)
  useEffect(() => {
    if (userId == null) return;

    try {
      // Dynamic import to avoid circular dependency
      import('./contentSync').then(({ initiateContentSync }) => {
        const { addListener, destroy } = initiateContentSync({
          strategy: 'polling', // أو 'realtime' إذا كان VITE_SUPABASE_ANON_KEY متاحاً
          onChange: handleContentChange,
          pollingInterval: 20_000,
        });

        syncUnsubscribeRef.current = destroy;

        return () => {
          destroy();
        };
      });
    } catch (e) {
      // تجاهل أخطاء الاستيراد
    }

    return () => {
      if (syncUnsubscribeRef.current) {
        syncUnsubscribeRef.current();
        syncUnsubscribeRef.current = null;
      }
    };
  }, [userId, handleContentChange]);

  // العودة للتبويب بعد فترة: حدّث فقط إذا انتهت صلاحية النسخة المحفوظة.
  useEffect(() => {
    if (userId == null || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const age = bootstrapAgeMs(userId);
      if (age === null || age >= REFRESH_AFTER_MS) run(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, run]);

  const retry = useCallback(() => run(true), [run]);

  return { data, reloading, error, retry, isSyncing, lastSyncAt };
}