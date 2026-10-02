import type { FC } from 'react';
import { useLang } from '../i18n';
import type { StudentFilter } from '../types/admin';

interface StudentHeaderProps {
  filteredLength: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  showResetPanel: boolean;
  onToggleResetPanel: () => void;
  pendingResetCount: number;
  onToggleResetPanelLoad: () => void;
  currentFilter: StudentFilter;
  onChangeFilter: (filter: StudentFilter) => void;
  filterCounts: Record<StudentFilter, number>;
  t: (key: string, params?: Record<string, string | number>) => string;
  isResetsLoading: boolean;
}

const FILTERS: ReadonlyArray<{ key: StudentFilter; tKey: string }> = [
  { key: 'all', tKey: 'admin.filterAll' },
  { key: 'subscribed', tKey: 'admin.filterSubscribed' },
  { key: 'unsubscribed', tKey: 'admin.filterUnsubscribed' },
  { key: 'blocked', tKey: 'admin.filterBlocked' },
];

export const StudentHeader: FC<StudentHeaderProps> = ({
  filteredLength,
  onRefresh,
  isRefreshing,
  showResetPanel,
  onToggleResetPanel,
  pendingResetCount,
  onToggleResetPanelLoad,
  currentFilter,
  onChangeFilter,
  filterCounts,
  t,
  isResetsLoading,
}) => {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
          <h1 className="text-2xl sm:text-3xl font-fire text-fire-400">
            👨‍🎓 {t('admin.studentsList')}{' '}
            <span className="text-base sm:text-xl font-bold text-fire-200">({filteredLength})</span>
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn-fire-rounded inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold fire-shadow hover:fire-bright transition-shadow disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
          >
            {isRefreshing ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-fire-400 border-t-transparent" />
            ) : (
              '↻'
            )}
            {t('admin.refresh')}
          </button>
          <button
            onClick={() => {
              onToggleResetPanel();
              onToggleResetPanelLoad();
            }}
            className="btn-fire-rounded inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold fire-shadow disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
          >
            🔑 {t('admin.resetListTitle')}
            {pendingResetCount > 0 && (
              <span className="rounded-full bg-fire-500/30 px-1.5 py-0.5 text-[10px] font-black text-fire-100">
                {pendingResetCount}
              </span>
            )}
          </button>
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => onChangeFilter(f.key)}
                className={`btn-fire-rounded inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors fire-shadow ${
                  currentFilter === f.key ? 'bg-fire-500/20 text-fire-300 ring-1 ring-fire-500/40' : 'bg-ink-800 text-gray-400 hover:text-white'
                }`}
              >
                {t(f.tKey)}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${currentFilter === f.key ? 'bg-fire-500/30 text-fire-100' : 'bg-ink-700 text-gray-300'}`}>
                  {filterCounts[f.key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentHeader;