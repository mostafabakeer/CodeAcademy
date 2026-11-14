import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLang } from '../i18n';
import { useUser } from '../store/authStore';
import { getNotifPromptDismissedAt, setNotifPromptDismissed } from '../lib/localStore';
import {
  ensurePushSubscription,
  isIOS,
  isPushSupported,
  isStandalonePwa,
  subscribeToPush,
} from '../lib/pushNotifications';

/** ننتظر قليلاً حتى يستقرّ الدخول وتظهر الصفحة قبل الظهور. */
const SHOW_DELAY_MS = 3500;

/** "لاحقاً" ليست رفضاً نهائياً: نعيد السؤال بعد 3 أيام. */
const RETRY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** مدة إظهار رسالة النجاح قبل الإخفاء. */
const SUCCESS_HIDE_MS = 2600;

type Stage = 'hidden' | 'ask' | 'blocked' | 'ios';

type Feedback = 'enabled' | 'denied' | 'failed' | null;

/**
 * بطاقة تفعيل الإشعارات بنقرة واحدة.
 *
 * المتصفحات لا تسمح بتفعيل الإشعارات تلقائياً: طلب الإذن لازم يكون باستجابة
 * لنقرة من المستخدم، وإلا يُرفض الطلب أو يُتجاهل. لذلك نطلب النقرة صراحةً
 * بدل الاكتفاء بمحاولة صامتة عند الدخول (وهي تفشل دائماً حين يكون الإذن
 * `default`). بدون هذه البطاقة يبقى الطالب بلا اشتراك push، فلا يصله أي
 * تنبيه عند إضافة امتحان أو درس أو مذكرة.
 *
 * الحالات:
 * - `default`  ⇒ زر تفعيل مباشر.
 * - `denied`   ⇒ لا يمكن للموقع أن يسأل مرة أخرى؛ نعرض خطوات السماح من
 *                إعدادات المتصفح + زر "تحقّق مرة أخرى" (بعد أن يسمح المستخدم
 *                يعمل الاشتراك فوراً بلا إعادة تحميل).
 * - آيفون غير مثبّت ⇒ خطوات الإضافة للشاشة الرئيسية (iOS لا يسمح بالإشعارات
 *                إلا داخل التطبيق المثبّت).
 * - `granted`  ⇒ مزامنة صامتة للاشتراك ثم إخفاء البطاقة.
 */
export default function NotificationPrompt() {
  const { t } = useLang();
  const user = useUser();
  const [stage, setStage] = useState<Stage>('hidden');
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const timer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  const needsInstallFirst = isIOS() && !isStandalonePwa();

  /** يقرأ إذن المتصفح الحالي ويحدّد البطاقة المناسبة. */
  const evaluate = useCallback(() => {
    if (!user || !isPushSupported()) {
      setStage('hidden');
      return;
    }
    if (Notification.permission === 'granted') {
      setStage('hidden');
      // الإذن صار متاحاً (مثلاً بعد السماح من إعدادات المتصفح) ⇒ اشتراك صامت.
      void ensurePushSubscription();
      return;
    }
    if (needsInstallFirst) {
      setStage('ios');
      return;
    }
    setStage(Notification.permission === 'denied' ? 'blocked' : 'ask');
  }, [user, needsInstallFirst]);

  useEffect(() => {
    if (!user) {
      setStage('hidden');
      return;
    }

    evaluate();

    const dismissedAt = getNotifPromptDismissedAt();
    if (dismissedAt && Date.now() - dismissedAt < RETRY_AFTER_MS) return;
    if (!navigator.onLine) return;

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer.current);
  }, [user, evaluate]);

  // العودة للصفحة بعد تغيير إعدادات المتصفح: نعيد القراءة فوراً بدل انتظار reload.
  useEffect(() => {
    if (!user) return;
    const sync = () => {
      if (document.visibilityState === 'hidden') return;
      evaluate();
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [user, evaluate]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const dismiss = () => {
    setNotifPromptDismissed();
    setDismissed(true);
    setFeedback(null);
  };

  const enable = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await subscribeToPush();
      setFeedback('enabled');
      hideTimer.current = window.setTimeout(() => setDismissed(true), SUCCESS_HIDE_MS);
    } catch (error) {
      const message = (error as Error)?.message ?? '';
      const blocked = Notification.permission === 'denied' || /denied|permission/i.test(message);
      setFeedback(blocked ? 'denied' : 'failed');
      if (blocked) setStage('blocked');
    } finally {
      setBusy(false);
    }
  };

  /** بعد السماح من إعدادات المتصفح: نعيد الفحص ثم نشترك فوراً. */
  const recheck = async () => {
    setFeedback(null);
    if (Notification.permission === 'granted') {
      await enable();
      return;
    }
    evaluate();
    setFeedback('denied');
  };

  const visible = ready && !dismissed && stage !== 'hidden';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -48 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -48 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed inset-x-0 z-[72] mx-auto w-[calc(100%-2rem)] max-w-md"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.75rem)' }}
        >
          <div className="card-fire relative overflow-hidden rounded-2xl p-4 shadow-2xl shadow-black/60">
            <button
              type="button"
              aria-label={t('notif.close')}
              onClick={dismiss}
              className="absolute left-2.5 top-2.5 flex h-10 w-10 items-center justify-center rounded-full text-xl leading-none text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>

            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="shrink-0 text-2xl leading-none">
                🔔
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-bold text-white">
                  {t(
                    stage === 'ios'
                      ? 'notif.iosTitle'
                      : stage === 'blocked'
                        ? 'notif.blockedTitle'
                        : 'notif.title',
                  )}
                </p>
                <p className="text-xs leading-relaxed text-gray-400">
                  {t(
                    stage === 'ios'
                      ? 'notif.iosIntro'
                      : stage === 'blocked'
                        ? 'notif.blockedDesc'
                        : 'notif.desc',
                  )}
                </p>
              </div>
            </div>

            {stage === 'ios' ? (
              <ol className="mt-4 space-y-1.5 text-xs text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="install-step shrink-0">1</span>
                  <span>{t('notif.iosStep1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="install-step shrink-0">2</span>
                  <span>{t('notif.iosStep2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="install-step shrink-0">3</span>
                  <span>{t('notif.iosStep3')}</span>
                </li>
              </ol>
            ) : (
              <button
                type="button"
                onClick={stage === 'blocked' ? recheck : enable}
                disabled={busy || feedback === 'enabled'}
                className="btn-fire mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70"
              >
                {feedback === 'enabled'
                  ? t('notif.enabled')
                  : busy
                    ? t('notif.enabling')
                    : stage === 'blocked'
                      ? t('notif.recheck')
                      : t('notif.accept')}
              </button>
            )}

            {feedback === 'denied' || feedback === 'failed' ? (
              <p className="mt-2 text-center text-[11px] font-semibold text-amber-300">
                {t(feedback === 'denied' ? 'notif.denied' : 'notif.failed')}
              </p>
            ) : null}

            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/5"
            >
              {t('notif.later')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
