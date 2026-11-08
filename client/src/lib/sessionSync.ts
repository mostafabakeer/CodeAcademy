/**
 * مزامنة حالة المصادقة بين تبويبات/نوافذ الموقع المفتوحة على نفس المتصفح.
 *
 * الكوكي مشترك بين التبويبات أصلاً، لكن حالة React في كل تبويب منفصلة:
 * لو سجّل المستخدم الخروج من تبويب، يجب أن تخرج بقية التبويبات فوراً
 * (بدل أن تظل تعرض بيانات الحساب حتى إعادة التحميل).
 */
export type AuthEvent = 'login' | 'logout';

const CHANNEL_NAME = 'dr_code_auth';

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return channel;
}

/** يُبلّغ التبويبات الأخرى — لا يعود للتبويب المُرسل (سلوك BroadcastChannel). */
export function broadcastAuth(event: AuthEvent): void {
  try {
    getChannel()?.postMessage({ event, at: Date.now() });
  } catch {
    /* غير مدعوم/محظور — المزامنة تحسين لا شرط */
  }
}

export function onAuthBroadcast(handler: (event: AuthEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => {
    const event = e.data?.event;
    if (event === 'login' || event === 'logout') handler(event);
  };
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}
