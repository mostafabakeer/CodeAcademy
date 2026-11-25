import { create } from 'zustand';

/**
 * تنبيهات خفيفة (Toast) — طبقة عرض مستقلة عن React حتى يستطيع أي كود
 * (مثل طبقة الـ API) إظهار رسالة دون المرور بمكوّن.
 *
 * لا نستخدم مكتبة خارجية: الحجم صغير والسلوك متوقّع، وكل تنبيه يُزال تلقائياً
 * بعد مدة قصيرة حتى لا تتراكم الرسائل.
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  at: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string) => string;
  dismiss: (id: string) => void;
}

const MAX_TOASTS = 4;
const DEFAULT_TTL = 4200;
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

function scheduleDismiss(id: string, ttl: number) {
  const existing = timeouts.get(id);
  if (existing) clearTimeout(existing);
  timeouts.set(
    id,
    setTimeout(() => {
      timeouts.delete(id);
      useToastStore.getState().dismiss(id);
    }, ttl),
  );
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = `t${++counter}`;
    set((s) => ({
      // الأقدم يُسقط عند الامتلاء — الأسطر الأربعة كافية بلا ازدحام بصري.
      toasts: [...s.toasts, { id, kind, message, at: Date.now() }].slice(-MAX_TOASTS),
    }));
    scheduleDismiss(id, kind === 'error' ? 6500 : DEFAULT_TTL);
    return id;
  },
  dismiss: (id) => {
    const timer = timeouts.get(id);
    if (timer) clearTimeout(timer);
    timeouts.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** واجهة مختصرة تُستخدم من خارج المكوّنات أيضاً. */
export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message),
  info: (message: string) => useToastStore.getState().push('info', message),
};
