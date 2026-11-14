import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLang } from '../i18n';
import { useUser } from '../store/authStore';
import { getNotifPromptDismissedAt, setNotifPromptDismissed } from '../lib/localStore';
import { isIOS, isPushSupported, isStandalonePwa, subscribeToPush } from '../lib/pushNotifications';

/** ننتظر قليلاً حتى يستقرّ الدخول وتظهر الصفحة قبل الظهور. */
const SHOW_DELAY_MS = 3500;

/** "لاحقاً" ليست رفضاً نهائياً: نعيد السؤال بعد 3 أيام. */
const RETRY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** مدة إظهار رسالة النجاح قبل الإخفاء. */
const SUCCESS_HIDE_MS = 2600;

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
 * على الآيفون لا تعمل الإشعارات إلا بعد تثبيت الموقع على الشاشة الرئيسية،
 * فنعرض خطوات التثبيت بدل زر لا يعمل.
 */
export default function NotificationPrompt() {
  const { t } = useLang();
  const user = useUser();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const timer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  const needsInstallFirst = isIOS() && !isStandalonePwa();

  useEffect(() => {
    if (!user) return;
    if (!isPushSupported()) return;
    // granted: الاشتراك تتم مزامنته تلقائياً. denied: لا يمكن سؤال المستخدم
    // مرة أخرى من الصفحة (يلزمه تغيير إعدادات الموقع بنفسه).
    if (Notification.permission !== 'default') return;
    if (!navigator.onLine) return;

    const dismissedAt = getNotifPromptDismissedAt();
    if (dismissedAt && Date.now() - dismissedAt < RETRY_AFTER_MS) return;

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer.current);
  }, [user]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const dismiss = () => {
    setNotifPromptDismissed();
    setVisible(false);
    setFeedback(null);
  };

  const enable = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await subscribeToPush();
      setFeedback('enabled');
      hideTimer.current = window.setTimeout(() => setVisible(false), SUCCESS_HIDE_MS);
    } catch (error) {
      const message = (error as Error)?.message ?? '';
      setFeedback(Notification.permission === 'denied' ? 'denied' : /denied|permission/i.test(message) ? 'denied' : 'failed');
    } finally {
      setBusy(false);
    }
  };

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
                  {t(needsInstallFirst ? 'notif.iosTitle' : 'notif.title')}
                </p>
                <p className="text-xs leading-relaxed text-gray-400">
                  {t(needsInstallFirst ? 'notif.iosIntro' : 'notif.desc')}
                </p>
              </div>
            </div>

            {needsInstallFirst ? (
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
                onClick={enable}
                disabled={busy || feedback === 'enabled'}
                className="btn-fire mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70"
              >
                {feedback === 'enabled'
                  ? t('notif.enabled')
                  : busy
                    ? t('notif.enabling')
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
