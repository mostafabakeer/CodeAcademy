import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLang } from '../i18n';
import { getInstallDismissed, setInstallDismissed } from '../lib/localStore';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const SHOW_DELAY_MS = 2200;

function isAppleDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function alreadyInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Ø¨Ø·Ø§Ù‚Ø© ØªØ«Ø¨ÙŠØª PWA ØªØ¸Ù‡Ø± Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© ÙÙ‚Ø·:
 * - Ø£Ù†Ø¯Ø±ÙˆÙŠØ¯/ÙƒØ±ÙˆÙ…/Ø§ÙŠØ¯Ø¬: Ø²Ø± ØªØ«Ø¨ÙŠØª Ø¨Ù†Ù‚Ø±Ø© ÙˆØ§Ø­Ø¯Ø© Ø¹Ø¨Ø± beforeinstallprompt.
 * - Ø£ÙŠÙÙˆÙ†/Ø£ÙŠØ¨Ø§Ø¯: Ø¥Ø±Ø´Ø§Ø¯Ø§Øª "Ø£Ø¶Ù Ù„Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©".
 * - "Ù„Ø§ØŒ Ø´ÙƒØ±Ø§Ù‹" Ø£Ùˆ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ âœ• = Ø±ÙØ¶ Ø¯Ø§Ø¦Ù… (Ù„Ø§ ØªØ¸Ù‡Ø± Ù…Ø¬Ø¯Ø¯Ø§Ù‹ Ø¨Ø¹Ø¯Ù‡Ø§ Ø£Ø¨Ø¯Ø§Ù‹).
 */
export default function InstallPrompt() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const isApple = isAppleDevice();

  useEffect(() => {
    if (getInstallDismissed() || alreadyInstalled()) return;

    const schedule = () => {
      if (!navigator.onLine) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    };

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferred(promptEvent);
      if (promptEvent.userChoice) promptEvent.userChoice.then(() => setDeferred(null));
      schedule();
    };

    const onAppInstalled = () => {
      window.clearTimeout(timer.current);
      setVisible(false);
      setDeferred(null);
    };

    // Ù…Ù„Ø§Ø­Ø¸Ø©: Ù†Ø³ØªÙ…Ø¹ Ù„Ù„Ø­Ø¯Ø« Ù…Ù† Ø£ÙˆÙ„ Ù„Ø­Ø¸Ø©ØŒ Ù„ÙƒÙ† Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© ØªÙØ¬Ø¯ÙˆÙ„ Ù„Ù„Ø¸Ù‡ÙˆØ± Ø£ÙˆÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¹Ù„Ù‰ Ø£ÙŠ Ø¬Ù‡Ø§Ø²
    // (Ù…ÙˆØ¨Ø§ÙŠÙ„ Ø£Ùˆ Ø¯ÙŠØ³ÙƒØªÙˆØ¨) â€” ÙˆÙ„ÙŠØ³Øª Ù…Ø´Ø±ÙˆØ·Ø© Ø¨ÙˆØµÙˆÙ„ beforeinstallprompt (Ù‚Ø¯ Ù„Ø§ ÙŠØµÙ„Ù‡ Ø¨Ø¹Ø¶ Ø§Ù„Ù…ØªØµÙØ­Ø§Øª).
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    schedule();

    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const close = () => {
    setInstallDismissed();
    setVisible(false);
    setDeferred(null);
  };

  const installNow = async () => {
    if (!deferred) return;
    const ev = deferred;
    setDeferred(null);
    setVisible(false);
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      // Ø§Ù„Ø±ÙØ¶ Ù…Ù† Ù†Ø§ÙØ°Ø© Ø§Ù„Ù…ØªØµÙØ­ Ù†ÙØ³Ù‡Ø§ â‰  Ø±ÙØ¶ Ù†Ù‡Ø§Ø¦ÙŠ: ØªÙØ¹Ø±Ø¶ Ø§Ù„Ø²ÙŠØ§Ø±Ø© Ø§Ù„Ù‚Ø§Ø¯Ù…Ø© Ù„ÙƒÙ† Ù„ÙŠØ³ Ø§Ù„Ø¢Ù†.
      if (choice.outcome !== 'accepted') return;
    } catch {
      /* ØªÙØºÙ„Ù‚ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© ÙˆÙ†Ù†ØªÙ‡ÙŠ */
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 64 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 64 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="install-card fixed inset-x-0 z-[70] mx-auto w-[calc(100%-2rem)] max-w-md"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <div className="card-fire relative overflow-hidden rounded-2xl p-4 shadow-2xl shadow-black/50">
            <button
              type="button"
              aria-label={t('install.close')}
              onClick={close}
              className="absolute left-2.5 top-2.5 flex h-10 w-10 items-center justify-center rounded-full text-xl leading-none text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              âœ•
            </button>

            <div className="flex items-start gap-3">
              <img src="/logo.webp" alt="" className="h-12 w-12 shrink-0 rounded-xl object-contain" />
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-bold text-white">{t('install.title')}</p>
                <p className="text-xs leading-relaxed text-gray-400">
                  {t(deferred ? 'install.desc' : isApple ? 'install.iosIntro' : 'install.browserHint')}
                </p>
              </div>
            </div>

            {deferred ? (
              <button
                type="button"
                onClick={installNow}
                className="btn-fire mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white"
              >
                {t('install.accept')}
              </button>
            ) : isApple ? (
              <ol className="mt-4 space-y-1.5 text-xs text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="install-step shrink-0">1</span>
                  <span>{t('install.iosStep1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="install-step shrink-0">2</span>
                  <span>{t('install.iosStep2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="install-step shrink-0">3</span>
                  <span>{t('install.iosStep3')}</span>
                </li>
              </ol>
            ) : null}

            <button
              type="button"
              onClick={close}
              className="mt-3 w-full rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/5"
            >
              {t('install.refuse')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}