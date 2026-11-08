import type { FC } from 'react';
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

const Spinner: FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <span
    className={`inline-block shrink-0 animate-spin rounded-full border-2 border-fire-400 border-t-transparent ${className}`}
    aria-hidden="true"
  />
);

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

  const roleBadge = (s: Student) =>
    s.role === 'admin' ? (
      <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">{t('profile.admin')}</span>
    ) : (
      <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-300">{t('profile.student')}</span>
    );

  /**
   * أزرار الإجراءات المشتركة بين الجدول (كمبيوتر) والبطاقات (موبايل).
   * على الموبايل نكبّر منطقة اللمس (py-2.5) ونرتّبها في شبكة عمودين.
   */
  const actions = (s: Student, mobile: boolean) => {
    const pad = mobile ? 'justify-center px-3 py-2.5 text-xs' : 'px-2.5 py-1 text-xs';
    return (
      <div className={mobile ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap items-center justify-end gap-1.5'}>
        {s.role === 'student' && (
          <>
            <button
              onClick={() => onToggleSubscription(s)}
              disabled={isBusy(s.id, 'sub')}
              className={`btn-fire-rounded inline-flex items-center gap-1.5 rounded-lg font-bold fire-shadow transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${pad} ${s.subscription ? 'border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
            >
              {isBusy(s.id, 'sub') ? <Spinner /> : null}
              {s.subscription ? t('admin.disableSub') : t('admin.enableSub')}
            </button>
            <button
              onClick={() => onToggleBlock(s)}
              disabled={isBusy(s.id, 'block')}
              className={`btn-fire-rounded inline-flex items-center gap-1.5 rounded-lg font-bold fire-shadow transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${pad} ${s.blocked ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-fire-500/20 text-fire-300 hover:bg-fire-500/30'}`}
            >
              {isBusy(s.id, 'block') ? <Spinner /> : null}
              {s.blocked ? t('admin.unblock') : t('admin.block')}
            </button>
          </>
        )}
        <button
          onClick={() => onToggleRole(s)}
          disabled={isBusy(s.id, 'role')}
          className={`btn-fire-rounded inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 font-bold text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60 ${pad}`}
        >
          {isBusy(s.id, 'role') ? <Spinner /> : null}
          {s.role === 'admin' ? t('admin.makeStudent') : t('admin.makeAdmin')} ⇄
        </button>
        <button
          onClick={() => onDelete(s)}
          disabled={isBusy(s.id, 'delete')}
          className={`btn-fire-rounded inline-flex items-center gap-1.5 rounded-lg bg-fire-950/60 font-bold text-fire-300 hover:bg-fire-600/30 disabled:cursor-not-allowed disabled:opacity-60 ${pad}`}
        >
          {isBusy(s.id, 'delete') ? <Spinner /> : <span aria-hidden="true">🗑</span>}
          {t('admin.deleteAccount')}
        </button>
        <button
          onClick={() => onOpenDetail(s.id)}
          disabled={isBusy(s.id, 'detail')}
          className={`btn-ghost-fire inline-flex items-center gap-1.5 rounded-lg font-bold disabled:cursor-not-allowed disabled:opacity-60 ${mobile ? pad : 'px-3 py-1 text-xs'}`}
        >
          {isBusy(s.id, 'detail') ? <Spinner /> : null}
          {t('admin.details')}
        </button>
      </div>
    );
  };

  return (
    <>
      {/* ===== موبايل: بطاقات (لا تمرير أفقي ولا تصغير خط) ===== */}
      <div className="space-y-3 md:hidden">
        {students.map((s, i) => (
          <article
            key={s.id}
            className="card-fire animate-fade-in-row rounded-2xl p-4"
            style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold text-gray-100">{s.fullName}</div>
                <div className="text-xs text-gray-400" dir="ltr">
                  {s.phone}
                </div>
              </div>
              {statusBadge(s)}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ink-800 px-2.5 py-0.5 text-xs font-bold text-gray-300">{s.gradeName}</span>
              <LevelBadge levelKey={s.level?.key} name={s.level?.name} nameEn={s.level?.nameEn} size="sm" />
              {roleBadge(s)}
            </div>

            <div className="mt-2">
              <ExamScores scores={s.examScores ?? []} emptyLabel={t('admin.noExamScores')} />
            </div>

            <div className="mt-3 border-t border-ink-800 pt-3">{actions(s, true)}</div>
          </article>
        ))}
      </div>

      {/* ===== تابلت/كمبيوتر: الجدول ===== */}
      <div className="card-fire hidden overflow-x-auto rounded-2xl md:block">
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
              <tr
                key={s.id}
                className="animate-fade-in-row border-b border-ink-800 opacity-0 transition-all duration-300 hover:bg-ink-850"
                style={{ animationDelay: `${i * 20}ms` }}
              >
                <td className="px-4 py-3 font-bold">{s.fullName}</td>
                <td className="px-4 py-3" dir="ltr">
                  {s.phone}
                </td>
                <td className="px-4 py-3">{s.gradeName}</td>
                <td className="px-4 py-3">
                  <LevelBadge levelKey={s.level?.key} name={s.level?.name} nameEn={s.level?.nameEn} size="sm" />
                </td>
                <td className="px-4 py-3">
                  <ExamScores scores={s.examScores ?? []} emptyLabel={t('admin.noExamScores')} />
                </td>
                <td className="px-4 py-3">{statusBadge(s)}</td>
                <td className="px-4 py-3">{roleBadge(s)}</td>
                <td className="px-4 py-3">{actions(s, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default StudentTable;
