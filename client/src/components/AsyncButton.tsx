import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Spinner from './Spinner';
import { useActionActive } from '../store/actionStore';

type Variant = 'fire' | 'ghost' | 'danger' | 'plain';

interface AsyncButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** مفتاح الإجراء في المخزن — يجعل الزر معطّلاً تلقائياً أثناء تنفيذه. */
  actionKey?: string;
  /** حالة تعطيل إضافية (رفع/تحميل خارجي). */
  busy?: boolean;
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  fire: 'btn-fire text-white',
  ghost: 'btn-ghost-fire',
  danger: 'btn-danger-fire',
  plain: '',
};

/**
 * زر موحّد لكل إجراء يرسل بيانات:
 * - يعرض سبينر ويُعطَّل أثناء التنفيذ (لا ضغط مزدوج).
 * - `aria-busy` + `aria-disabled` لقارئ الشاشة.
 * - يحافظ على كل خصائص `<button>` الأصلية.
 */
const AsyncButton = forwardRef<HTMLButtonElement, AsyncButtonProps>(function AsyncButton(
  { actionKey, busy = false, variant = 'fire', className = '', disabled, children, type = 'button', ...rest },
  ref,
) {
  const storeBusy = useActionActive(actionKey);
  const isBusy = busy || storeBusy;
  const isDisabled = disabled || isBusy;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isBusy || undefined}
      aria-disabled={isDisabled || undefined}
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {isBusy && <Spinner className="me-2" />}
      {children}
    </button>
  );
});

export default AsyncButton;
