import type { FC } from 'react';
import { motion } from 'motion/react';
import LevelBadge from './LevelBadge';
import ExamScores from './ExamScores';
import { useLang } from '../i18n';

interface Student {
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
}

interface StudentTableProps {
  students: Student[];
  isBusy: (id: number | string, action: string) => boolean;
  onToggleSubscription: (s: Student) => void;
  onToggleBlock: (s: Student) => void;
  onToggleRole: (s: Student) => void;
  onDelete: (s: Student) => void;
  onOpenDetail: (id: number) => void;
}

const StudentTable: FC<StudentTableProps> = ({
  students,
  isBusy,
  onToggleSubscription,
  onToggleBlock,
  onToggleRole,
  onDelete,
  onOpenDetail,
}) => {
  const { t } = useLang();

  const statusBadge = (s: Student) => {
    if (s.blocked)
      return (
        <span className="rounded-full bg-fire-500/20 px-2.5 py-0.5 text-xs font-bold text-fire-300 transition-colors">
          🚫 {t('admin.blocked')}
        </span>
      );
    if (s.subscription)
      return (
        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 transition-colors">
          ✓ {t('admin.subscribed')}
        </span>
      );
    return (
      <span className="rounded-full bg-ink-600/40 px-2.5 py-0.5 text-xs font-bold text-gray-400">
        — {t('admin.notSubscribed')}
      </span>
    );
  };

  return (
    <div className="card-fire overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-ink-600 text-start text-gray-400">
            <th className="px-4 py-3 text-start">{t('profile.fullName')}</th>
            <th className="px-4 py-3 text-start">{t('profile.phone')}</th>
            <th className="px-4 py-3 text-start">{t('profile.grade')}</th>
            <th className="px-4 py-3 text-start">{t('admin.level')}</th>
            <th className="px-4 py-3 text-start">{t('admin.examScoresLabel')}</th>
            <th className="px-4 py-3 text-start">{t('admin.status')}</th>
            <th className="px-4 py-3 text-start">{t('admin.role')}</th>
            <th className="px-4 py-3 text-end">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.id} className="border-b border-ink-800 hover:bg-ink-850 transition-all duration-300 opacity-0 animate-fade-in-row" style={{ animationDelay: `${i * 20}ms` }}>
              <td className="px-4 py-3 font-bold">{s.fullName}</td>
              <td className="px-4 py-3" dir="ltr">{s.phone}</td>
              <td className="px-4 py-3">{s.gradeName}</td>
              <td className="px-4 py-3">
                <LevelBadge levelKey={s.level?.key} name={s.level?.name} nameEn={s.level?.nameEn} size="sm" />
              </td>
              <td className="px-4 py-3">
                <ExamScores scores={s.examScores ?? []} emptyLabel={t('admin.noExamScores')} />
              </td>
              <td className="px-4 py-3">{statusBadge(s)}</td>
              <td className="px-4 py-3">
                {s.role === 'admin' ? (
                  <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">{t('profile.admin')}</span>
                ) : (
                  <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-300">{t('profile.student')}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {s.role === 'student' && (
                    <>
                      <button
                        onClick={() => onToggleSubscription(s)}
                        disabled={isBusy(s.id, 'sub')}
                        className={`btn-fire-rounded inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold fire-shadow disabled:cursor-not-allowed disabled:opacity-60 ${s.subscription ? 'border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors'}`}
                      >
                        {isBusy(s.id, 'sub') ? <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent" /> : null}
                        {s.subscription ? t('admin.disableSub') : t('admin.enableSub')}
                      </button>
                      <button
                        onClick={() => onToggleBlock(s)}
                        disabled={isBusy(s.id, 'block')}
                        className={`btn-fire-rounded inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold fire-shadow disabled:cursor-not-allowed disabled:opacity-60 ${s.blocked ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors' : 'bg-fire-500/20 text-fire-300 hover:bg-fire-500/30 transition-colors'}`}
                      >
                        {isBusy(s.id, 'block') ? <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent" /> : null}
                        {s.blocked ? t('admin.unblock') : t('admin.block')}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onToggleRole(s)}
                    disabled={isBusy(s.id, 'role')}
                    className="btn-fire-rounded inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy(s.id, 'role') ? <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent" /> : null}
                    {s.role === 'admin' ? t('admin.makeStudent') : t('admin.makeAdmin')} ⇄
                  </button>
                  <button
                    onClick={() => onDelete(s)}
                    disabled={isBusy(s.id, 'delete')}
                    className="btn-fire-rounded inline-flex items-center gap-1.5 rounded-lg bg-fire-950/60 px-2.5 py-1 text-xs font-bold text-fire-300 hover:bg-fire-600/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy(s.id, 'delete') ? <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent" /> : '🗑'}
                    {t('admin.deleteAccount')}
                  </button>
                  <button
                    onClick={() => onOpenDetail(s.id)}
                    disabled={isBusy(s.id, 'detail')}
                    className="btn-ghost-fire inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy(s.id, 'detail') ? <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent" /> : null}
                    {t('admin.details')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default StudentTable;