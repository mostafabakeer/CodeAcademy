import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { onAuthBroadcast } from '../lib/sessionSync';
import { SESSION_REVOKED_EVENT } from '../api/client';
import { ensurePushSubscription } from '../lib/pushNotifications';

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
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const bootedRef = useRef(false);

  useEffect(() => {
    let active = true;

    // تشغيل boot مرة واحدة فقط (لا يعتمد على mutation للـ store)
    if (!bootedRef.current) {
      bootedRef.current = true;
      void runBoot();
    }

    // فك الحجب فور استقرار حالة الجلسة.
    const unsub = useAuthStore.subscribe((state) => {
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

  // مزامنة بين التبويبات: تسجيل خروج في تبويب ⇒ بقية التبويبات تخرج فوراً،
  // وتسجيل دخول في تبويب ⇒ بقية التبويبات تستعيد الجلسة بدون إعادة تحميل.
  useEffect(() => {
    return onAuthBroadcast((event) => {
      if (event === 'logout') {
        useAuthStore.setState({
          user: null,
          stats: null,
          examResults: [],
          levels: [],
          offline: false,
          loading: false,
        });
      } else {
        void useAuthStore.getState().runBoot();
      }
    });
  }, []);

  // عودة الشبكة: إعادة محاولة صامتة بدل بقاء المستخدم على شاشة "تعذّر الاتصال".
  useEffect(() => {
    const onOnline = () => {
      const state = useAuthStore.getState();
      if (state.offline) void state.reconnect();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // مزامنة اشتراك الإشعارات والاستماع للتنبيهات عند كل إقلاع/دخول
  useEffect(() => {
    if (!userId) return;
    void ensurePushSubscription();

    // الاستماع لإشعارات الرفع: عند نجاح رفع محتوى جديد، نبطل كاش bootstrap
    // ليتم جلب البيانات الجديدة عند الطلب التالي (مثل فتح قائمة المذكرات/الدروس)
    // دون إغلاق النوافذ المفتوحة (Modals).
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('upload-notifications');
      channel.onmessage = (event) => {
        if (event.data?.success) {
          import('../lib/content').then(({ invalidateBootstrap }) => {
            invalidateBootstrap(userId);
          });
        }
      };
      return () => {
        channel.close();
      };
    }
  }, [userId]);

  // الجهاز القديم للأدمن: الخادم أبطل جلسته لأن الحساب دخل من جهاز آخر.
  useEffect(() => {
    const onRevoked = () => {
      useAuthStore.setState({
        user: null,
        stats: null,
        examResults: [],
        levels: [],
        offline: false,
        loading: false,
      });
    };
    window.addEventListener(SESSION_REVOKED_EVENT, onRevoked);
    return () => window.removeEventListener(SESSION_REVOKED_EVENT, onRevoked);
  }, []);

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
