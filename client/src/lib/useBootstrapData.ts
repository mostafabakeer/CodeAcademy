import { useCallback, useEffect, useRef, useState } from 'react';
import { getBootstrapSync, loadBootstrap, type BootstrapData } from './content';

export interface BootstrapState {
  data: BootstrapData | null;
  reloading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * محتوى المستخدم مع استمرارية كاملة بعد إعادة التحميل:
 * - القيمة الابتدائية تأتي فورًا من آخر نسخة محفوظة (localStorage) حتى لو انتهت صلاحيتها.
 * - ثم يُحدَّث من الشبكة في الخلفية دون إفراغ الصفحة.
 * - فشل التحديث لا يمسح البيانات — يُعاد الخطأ فقط ليُعرض بتنبيه مع إعادة محاولة.
 */
export function useBootstrapData(userId: number | null | undefined): BootstrapState {
  const [data, setData] = useState<BootstrapData | null>(() => (userId != null ? getBootstrapSync(userId) : null));
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<number | null | undefined>(userId);

  const run = useCallback(
    (force: boolean) => {
      if (userId == null) return;
      setReloading(true);
      loadBootstrap(userId, force)
        .then((b) => {
          if (idRef.current === userId) {
            setData(b);
            setError(null);
          }
        })
        .catch((err) => {
          if (idRef.current !== userId) return;
          setError(err instanceof Error ? err.message : 'تعذّر تحديث المحتوى');
        })
        .finally(() => {
          if (idRef.current === userId) setReloading(false);
        });
    },
    [userId]
  );

  useEffect(() => {
    idRef.current = userId;
    if (userId == null) {
      setData(null);
      setReloading(false);
      setError(null);
      return;
    }
    const sync = getBootstrapSync(userId);
    if (sync) setData(sync);
    run(false);
  }, [userId, run]);

  const retry = useCallback(() => run(true), [run]);

  return { data, reloading, error, retry };
}