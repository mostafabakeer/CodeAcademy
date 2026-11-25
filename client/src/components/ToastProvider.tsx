import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useToastStore, type ToastKind } from '../store/toastStore';

const KIND_STYLE: Record<ToastKind, string> = {
  success: 'toast toast--success',
  error: 'toast toast--error',
  info: 'toast toast--info',
};

const KIND_ICON: Record<ToastKind, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

/** حاوية التنبيهات — aria-live حتى يقرأها قارئ الشاشة دون سرقة التركيز. */
export default function ToastProvider() {
  const { t } = useLang();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-viewport" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((item) => (
        <div key={item.id} className={KIND_STYLE[item.kind]} role={item.kind === 'error' ? 'alert' : undefined}>
          <span className="toast__icon" aria-hidden="true">{KIND_ICON[item.kind]}</span>
          <p className="toast__message">{item.message}</p>
          <button type="button" className="toast__close" aria-label={t('toast.dismiss')} onClick={() => dismiss(item.id)}>
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
