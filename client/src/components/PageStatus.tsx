import type { ReactNode } from 'react';

/**
 * تنبيه علوي خفيف: توجد بيانات محفوظة معروضة، لكن تحديث الشبكة الأخير فشل.
 * نتريث على البيانات المحفوظة ولا نخفيها — نمنح المستخدم زر إعادة محاولة فقط.
 */
export function StaleNotice({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <span className="flex items-center gap-2">⚠️ {message || 'تعذّر التحديث — نعرض آخر نسخة محفوظة.'}</span>
      <button
        onClick={onRetry}
        className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/15"
      >
        ⟳ إعادة المحاولة
      </button>
    </div>
  );
}

/** كتلة خطأ كاملة (عندما لا توجد بيانات أصلًا): بدل صفحة فاضية صامتة. */
export function LoadError({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-fire-500/30 bg-fire-950/30 p-8 text-center">
      <span className="text-3xl">⚠️</span>
      <p className="text-gray-300">{message}</p>
      {children}
      {onRetry && (
        <button onClick={onRetry} className="btn-fire rounded-lg px-5 py-2 text-sm font-bold text-white">
          ⟳ إعادة المحاولة
        </button>
      )}
    </div>
  );
}