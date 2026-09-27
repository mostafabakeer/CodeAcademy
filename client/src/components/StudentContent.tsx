import { FC } from 'react';
import { useLang } from '../i18n';
import { Spinner } from './Spinner';

interface StudentContentProps {
  loading: boolean;
  allUsersLength: number;
  paged: Array<{
    id: number;
    fullName: string;
    phone: string;
    grade: string;
    gradeName: string;
    role: 'student' | 'admin';
    points: number;
    level: { key: string; name: string; nameEn: string };
    examAvg: number;
    completedLessons: number;
    totalLessons: number;
    examsTaken: number;
    examScores: Array<{ examId: number; at: number; score: number }>;
    subscription: boolean;
    blocked: boolean;
    createdAt: number;
  }>;
  error: string;
  success: string;
  onClearSuccess: () => void;
  isBusy: (id: number, action: string) => boolean;
  onToggleSubscription: (s: any) => void;
  onToggleBlock: (s: any) => void;
  onToggleRole: (s: any) => void;
  onDelete: (s: any) => void;
  onOpenDetail: (id: number) => void;
}

export const StudentContent: FC<StudentContentProps> = ({
  loading,
  allUsersLength,
  paged,
  error,
  success,
  onClearSuccess,
  isBusy,
  onToggleSubscription,
  onToggleBlock,
  onToggleRole,
  onDelete,
  onOpenDetail,
}) => {
  const { t } = useLang();

  return (
    <>
      {loading && allUsersLength > 0 && (
        <div className="flex items-center justify-center gap-2 py-1 text-sm text-gray-400">
          <Spinner className="h-4 w-4 text-fire-400" />
          <span>{t('common.loading')}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
          {error}
        </div>
      )}

      {success && (
        <div
          className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300"
          onClick={onClearSuccess}
        >
          {success}
        </div>
      )}

      {loading && allUsersLength === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
          <Spinner className="h-8 w-8 border-[3px] text-fire-400" />
          <span>{t('common.loading')}</span>
        </div>
      ) : false && (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">
          لا يوجد طلاب
        </p>
      )}
    </>
  );
};

export default StudentContent;