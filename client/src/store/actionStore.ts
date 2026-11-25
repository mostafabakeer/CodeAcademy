import { create } from 'zustand';
import { toast } from './toastStore';

/**
 * مخزن الإجراءات المركزي.
 *
 * الهدف: أي عملية تُرسل بيانات (حفظ/حذف/رفع/تسليم/دخول) تمرّ من هنا، فتحصل
 * تلقائياً على:
 *  - منع التكرار: نفس المفتاح لا يُنفّذ مرتين، والضغط المتكرر لا يُنشئ عنصرين.
 *  - شاشة تحميل حاجبة (اختياري) تُعطّل بقية الواجهة حتى ينتهي الإجراء.
 *  - نسبة تقدّم اختيارية (للرفع) وزر إلغاء.
 *  - رسالة نجاح/فشل موحّدة.
 *
 * الإجراءات الخلفية (مزامنة التقدّم، الحفظ التلقائي للكود، الاشتراك في الإشعارات)
 * لا تمرّ من هنا حتى لا تُظهر شاشة حاجبة بلا سبب.
 */

export type ActionKind = 'save' | 'delete' | 'submit' | 'upload' | 'login' | 'custom';

export interface ActionOptions {
  /** مفتاح فريد يمنع التكرار، مثل `exam:save:12`. */
  key: string;
  /** نص يظهر للمستخدم أثناء التنفيذ. */
  label: string;
  kind?: ActionKind;
  /** true (الافتراضي) = شاشة حاجبة تمنع أي إجراء آخر. */
  blocking?: boolean;
  /** رسالة تُعرض عند النجاح. عدم تمريرها = لا تنبيه نجاح. */
  successMessage?: string;
  /** مدة قصوى اختيارية بالمللي ثانية — تُلغي الإجراء عند تجاوزها. */
  timeoutMs?: number;
}

export interface ActionContext {
  signal: AbortSignal;
  /** 0..100 — تُظهر شريط تقدّم في الشاشة. null يخفيه. */
  setProgress: (value: number | null) => void;
  setLabel: (label: string) => void;
}

export interface ActiveAction {
  key: string;
  label: string;
  kind: ActionKind;
  blocking: boolean;
  progress: number | null;
  startedAt: number;
}

interface ActionState {
  active: Record<string, ActiveAction>;
  /** الأزرار تقرأ منه حالة التعطيل بلا اشتراك كامل في المخزن. */
  run: <T>(opts: ActionOptions, task: (ctx: ActionContext) => Promise<T>) => Promise<T | undefined>;
  cancel: (key: string) => void;
  isRunning: (key: string) => boolean;
}

const controllers = new Map<string, AbortController>();

// Default timeout for blocking actions (5 minutes)
const DEFAULT_ACTION_TIMEOUT_MS = 5 * 60_000;

export const useActionStore = create<ActionState>((set, get) => ({
  active: {},

  isRunning: (key) => Boolean(get().active[key]),

  cancel: (key) => {
    controllers.get(key)?.abort();
  },

  run: async (opts, task) => {
    const { key, label, kind = 'custom', blocking = true, successMessage, timeoutMs } = opts;
    const state = get();

    // 1) نفس الإجراء يعمل بالفعل ⇒ تجاهل الضغطة المكرّرة بصمت.
    if (state.active[key]) return undefined;

    const running = Object.values(state.active);
    // 2) أي إجراء حاجب نشط ⇒ لا نبدأ شيئاً آخر.
    if (running.some((a) => a.blocking)) {
      toast.info(label);
      return undefined;
    }
    // 3) لا نبدأ إجراءً حاجباً فوق عمل جارٍ (قد يكون رفعاً طويلاً).
    if (blocking && running.length > 0) {
      toast.info(label);
      return undefined;
    }

    const controller = new AbortController();
    controllers.set(key, controller);

    // Apply default timeout for blocking actions if not specified
    const effectiveTimeoutMs = timeoutMs ?? (blocking ? DEFAULT_ACTION_TIMEOUT_MS : undefined);

    set((s) => ({
      active: {
        ...s.active,
        [key]: { key, label, kind, blocking, progress: null, startedAt: Date.now() },
      },
    }));

    const patch = (value: Partial<ActiveAction>) => {
      set((s) => {
        const current = s.active[key];
        if (!current) return s;
        return { active: { ...s.active, [key]: { ...current, ...value } } };
      });
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (effectiveTimeoutMs && effectiveTimeoutMs > 0) {
      timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    }

    try {
      const result = await task({
        signal: controller.signal,
        setProgress: (value) => patch({ progress: value }),
        setLabel: (value) => patch({ label: value }),
      });
      if (successMessage) toast.success(successMessage);
      return result;
    } catch (err) {
      // الإلغاء من المستخدم ليس خطأً — لا نزعج برسالة حمراء.
      if (controller.signal.aborted) {
        toast.info(kind === 'upload' ? 'تم إلغاء الرفع' : 'تم إلغاء الإجراء');
      } else {
        toast.error((err as Error)?.message || 'تعذّر إتمام الإجراء، حاول مجدداً');
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      controllers.delete(key);
      set((s) => {
        if (!s.active[key]) return s;
        const next = { ...s.active };
        delete next[key];
        return { active: next };
      });
    }
  },
}));

/** اختصار للاستخدام داخل المكوّنات. */
export function useAction() {
  return useActionStore((s) => s.run);
}

/** حالة إجراء واحد — تُستخدم لتعطيل الزر وإظهار السبينر. */
export function useActionActive(key: string | undefined): boolean {
  return useActionStore((s) => (key ? Boolean(s.active[key]) : false));
}
