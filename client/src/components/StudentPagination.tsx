import type { FC } from 'react';
import { useLang } from '../i18n';

interface StudentPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const StudentPagination: FC<StudentPaginationProps> = ({
  page,
  totalPages,
  onPageChange,
}) => {
  const { t } = useLang();

  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-gray-400">{t('admin.pageInfo', { page, totalPages })}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="btn-ghost-fire rounded-lg px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('admin.pagePrev')}
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="btn-ghost-fire rounded-lg px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('admin.pageNext')}
        </button>
      </div>
    </div>
  );
};

export default StudentPagination;