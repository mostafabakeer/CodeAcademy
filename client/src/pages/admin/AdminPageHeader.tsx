import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  icon: string;
  title: ReactNode;
  subtitle?: string;
  /** زر/أدوات الصفحة الأساسية — تصبح بعرض كامل على الموبايل. */
  action?: ReactNode;
}

/**
 * ترويسة موحّدة لكل صفحات الأدمن: نفس الحجم، نفس المسافات، وتلتف بأمان
 * على الشاشات الضيقة بدل أن يخرج الزر خارج الشاشة.
 */
export default function AdminPageHeader({ icon, title, subtitle, action }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-black sm:text-2xl">
          <span aria-hidden="true">{icon}</span>
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {action && (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{action}</div>
      )}
    </div>
  );
}
