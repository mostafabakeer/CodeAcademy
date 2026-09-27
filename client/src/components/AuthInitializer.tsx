import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';

interface AuthInitializerProps {
  children: React.ReactNode;
}

/**
 * نقطة الإقلاع الوحيدة للمصادقة.
 *
 * الجلسة كلها في كوكي HttpOnly (`dr_code_token`) يصدره الـ Edge function، فيكفي
 * نداء `/api/auth/me` واحد. لا نستخدم supabase-js auth هنا إطلاقاً: هو نظام منفصل
 * لا يعرف هذا الكوكي، وربط `onAuthStateChange` به كان يستدعي `signOut()` داخل
 * معالج الحدث (تعليق) ولا يمسح كوكي الجلسة الحقيقي.
 *
 * `runBoot` يصفّر `loading` في كل المسارات (نجاح/401/خطأ)، فكتماله يعني أن
 * `ProtectedRoute` قادر على اتخاذ قراره — لا سبينر أبدي.
 */
export function AuthInitializer({ children }: AuthInitializerProps) {
  const [authReady, setAuthReady] = useState(false);
  const runBoot = useAuthStore((s) => s.runBoot);

  useEffect(() => {
    let active = true;
    // StrictMode يركّب التأثير مرتين في التطوير — نتجاهل الثانية.
    const store = useAuthStore;
    if (!(store as unknown as { __booted?: boolean }).__booted) {
      (store as unknown as { __booted?: boolean }).__booted = true;
      void runBoot();
    }
    // فك الحجب فور استقرار حالة الجلسة.
    const unsub = store.subscribe((state) => {
      if (active && !state.loading) setAuthReady(true);
    });
    // شبكة صامتة بلا استجابة = لا ننتظر للأبد (loading=false يُضبط عند الأخطاء).
    const failsafe = setTimeout(() => {
      if (active) setAuthReady(true);
    }, 6000);
    return () => {
      active = false;
      unsub();
      clearTimeout(failsafe);
    };
  }, [runBoot]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-fire-500/25 border-t-fire-500" />
          <div className="absolute inset-0 m-auto h-7 w-7 animate-flame rounded-full bg-gradient-to-br from-fire-500 to-ember-500" />
        </div>
        <p className="text-sm text-gray-400">جاري استعادة الجلسة...</p>
      </div>
    );
  }

  return <>{children}</>;
}
