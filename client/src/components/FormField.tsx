import type { ReactNode } from 'react';

/** حقل نموذج موحد: تسمية + حقل طفل (يُستخدم في نماذج لوحات الإدارة). */
export default function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-gray-300">
        {label} {required && <span className="text-fire-400">*</span>}
      </label>
      {children}
    </div>
  );
}