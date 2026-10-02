import type { FC } from 'react';
import { useLang } from '../i18n';

interface StudentSearchProps {
  query: string;
  onChangeQuery: (value: string) => void;
  grade: string;
  onChangeGrade: (value: string) => void;
  filteredCount: number;
  totalCount: number;
}

export const StudentSearch: FC<StudentSearchProps> = ({
  query,
  onChangeQuery,
  grade,
  onChangeGrade,
  filteredCount,
  totalCount,
}) => {
  const { t } = useLang();

  return (
    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
          placeholder={t('admin.searchStudents')}
          className="input-fire w-full rounded-xl py-2.5 pe-10 ps-10 text-sm"
        />
      </div>
      <select
        value={grade}
        onChange={(e) => onChangeGrade(e.target.value)}
        className="input-fire rounded-xl px-3.5 py-2.5 text-sm w-full sm:w-auto"
      >
        {[
          { key: 'all', tKey: 'admin.gradeAll' },
          { key: 'bac1', tKey: 'auth.bac1' },
          { key: 'bac2', tKey: 'auth.bac2' },
        ].map((g) => (
          <option key={g.key} value={g.key}>
            {t(g.tKey)}
          </option>
        ))}
      </select>
      <span className="rounded-full bg-ink-800 px-3.5 py-1.5 text-xs font-bold text-fire-300 flex items-center justify-center w-full sm:w-auto">
        {t('admin.resultsCount', { count: filteredCount, total: totalCount })}
      </span>
    </div>
  );
};