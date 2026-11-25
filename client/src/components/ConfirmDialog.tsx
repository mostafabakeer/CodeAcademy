import { create } from 'zustand';
import Modal from './Modal';
import { useLang } from '../i18n';

/**
 * بديل `window.confirm` القابل للتنسيق:
 *   if (!(await confirmDialog({ message: '...' }))) return;
 * يعيد Promise<boolean>، فيعمل بسلاسة مع معالجات async دون حجب الخيط.
 */

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  opts: ConfirmOptions | null;
}

const useConfirmStore = create<ConfirmState>(() => ({ open: false, opts: null }));

let resolver: ((value: boolean) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // لو وُجدت نافذة سابقة معلّقة، نغلقها كإلغاء حتى لا يبقى وعد بلا حل.
    resolver?.(false);
    resolver = resolve;
    useConfirmStore.setState({ open: true, opts });
  });
}

function settle(value: boolean) {
  const resolve = resolver;
  resolver = null;
  useConfirmStore.setState({ open: false });
  resolve?.(value);
}

export default function ConfirmDialog() {
  const { t } = useLang();
  const open = useConfirmStore((s) => s.open);
  const opts = useConfirmStore((s) => s.opts);

  return (
    <Modal open={open} onClose={() => settle(false)} title={opts?.title || t('confirm.title')}>
      <p className="whitespace-pre-line text-sm leading-7 text-gray-300">{opts?.message}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          autoFocus
          onClick={() => settle(false)}
          className="btn-ghost-fire rounded-xl px-4 py-2.5 text-sm font-bold"
        >
          {opts?.cancelText || t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => settle(true)}
          className={`${opts?.danger ? 'btn-danger-fire' : 'btn-fire text-white'} rounded-xl px-4 py-2.5 text-sm font-bold`}
        >
          {opts?.confirmText || t('common.confirm')}
        </button>
      </div>
    </Modal>
  );
}
