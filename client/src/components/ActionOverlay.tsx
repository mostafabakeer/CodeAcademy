import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useActionStore, type ActionKind } from '../store/actionStore';

const KIND_ICON: Record<ActionKind, string> = {
  save: '💾',
  delete: '🗑️',
  submit: '📤',
  upload: '☁️',
  login: '🔐',
  custom: '⚙️',
};

/**
 * شاشة تحميل حاجبة لكل إجراء يرسل بيانات.
 *
 * - تُعرض في portal خارج `#root`، ونُعطّل `#root` بـ `inert` فيتعذّر الضغط على
 *   أي رابط/زر أو التنقل أثناء الإجراء.
 * - تظهر بعد ~250ms فقط (CSS) حتى لا تومض في العمليات السريعة، لكن الحجب يبدأ
 *   فوراً.
 * - تعرض اسم الإجراء والزمن المنقضي ونسبة الرفع وزر الإلغاء عند توفّره.
 */
export default function ActionOverlay() {
  const { t } = useLang();
  const active = useActionStore((s) => s.active);
  const cancel = useActionStore((s) => s.cancel);

  const blocking = Object.values(active).find((a) => a.blocking);
  const visible = Boolean(blocking);
  const [now, setNow] = useState(() => Date.now());
  const panelRef = useRef<HTMLDivElement>(null);

  // مؤقّت الزمن المنقضي — يعمل فقط أثناء ظهور الشاشة (لا يستهلك شيئاً في الخلفية).
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [visible]);

  // تعطيل بقية الصفحة + منع التمرير + تحذير عند محاولة إغلاق التبويب.
  useEffect(() => {
    if (!visible) return;
    const root = document.getElementById('root');
    const previousOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute('aria-hidden') ?? null;

    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';

    const warnBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // بعض المتصفحات تتطلّب returnValue غير فارغ.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);

    // التركيز ينتقل إلى الشاشة حتى لا يبقى على زر مخفي/معطّل.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 30);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.body.style.overflow = previousOverflow;
      root?.removeAttribute('inert');
      if (previousAriaHidden === null) root?.removeAttribute('aria-hidden');
      else root?.setAttribute('aria-hidden', previousAriaHidden);
    };
  }, [visible]);

  // حبس التركيز داخل الشاشة: Tab/Shift+Tab يدوران على عناصرها فقط.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!focusables || focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!visible || !blocking) return null;

  const seconds = Math.max(0, Math.floor((now - blocking.startedAt) / 1000));
  const elapsed = seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`;
  const hasProgress = typeof blocking.progress === 'number';
  const canCancel = blocking.kind === 'upload';

  return createPortal(
    <div
      className="action-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      onKeyDown={onKeyDown}
    >
      <div ref={panelRef} tabIndex={-1} className="action-overlay__panel card-fire">
        <div className="action-overlay__icon" aria-hidden="true">
          {KIND_ICON[blocking.kind]}
          <span className="action-overlay__ring" />
        </div>

        <p className="action-overlay__label">{blocking.label}</p>
        <p className="action-overlay__hint">{t('action.pleaseWait')}</p>

        {hasProgress ? (
          <div className="action-overlay__progress" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, blocking.progress ?? 0))}%` }} />
          </div>
        ) : (
          <div className="action-overlay__bar" aria-hidden="true">
            <span />
          </div>
        )}

        <div className="action-overlay__meta">
          <span>{t('action.elapsed')}: {elapsed}</span>
          {hasProgress && <span>{Math.round(blocking.progress ?? 0)}%</span>}
        </div>

        {canCancel && (
          <button type="button" onClick={() => cancel(blocking.key)} className="btn-ghost-fire action-overlay__cancel">
            {t('action.cancel')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
