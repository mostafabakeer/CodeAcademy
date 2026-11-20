import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminPageHeader from './AdminPageHeader';
import { useLang } from '../../i18n';
import { api } from '../../api/client';

type ReviewStatus = 'pending_review' | 'graded';

interface SubmissionListItem {
  id: number;
  userId: number;
  examId: number;
  attemptNumber: number;
  status: ReviewStatus;
  submittedAt: number;
  fullName: string;
  phone: string;
  examTitle: string;
  examTitleEn: string;
  mcqEarnedPoints?: number;
  mcqMaxPoints?: number;
}

interface SubmissionListResponse {
  submissions: SubmissionListItem[];
  total: number;
  page: number;
}

interface SubmissionQuestion {
  id: number;
  text: string;
  textEn: string;
  points: number;
  answer: string;
  grade: { score: number; comment: string } | null;
}

interface SubmissionDetail {
  submission: {
    id: number;
    examId: number;
    attemptNumber: number;
    status: ReviewStatus;
    mcqScore: number;
    mcqCorrect: number;
    mcqTotal: number;
    score: number | null;
    earnedPoints: number;
    maximumPoints: number;
    submittedAt: number;
    gradedAt: number | null;
  };
  student: { id: number; fullName: string; phone: string; grade: string };
  exam: { id: number; title: string; titleEn: string };
  questions: SubmissionQuestion[];
}

function submittedDate(timestamp: number, lang: 'ar' | 'en'): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB');
}

function fetchSubmissions(status: ReviewStatus, page: number): Promise<SubmissionListResponse> {
  return api<SubmissionListResponse>(`/api/admin/essay-submissions?status=${status}&page=${page}&limit=30`);
}

export default function EssayReviewsAdmin() {
  const { t, lang } = useLang();
  const [status, setStatus] = useState<ReviewStatus>('pending_review');
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSubmissions = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const data = await fetchSubmissions(status, page);
      setSubmissions(data.submissions);
      setTotal(data.total);
      if (data.page !== page) setPage(data.page);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingList(false);
    }
  }, [page, status]);

  // Initial load on mount
  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Reload when page or status changes
  useEffect(() => {
    loadSubmissions();
  }, [page, status]);

  const activeSelectedId = submissions.some((item) => item.id === selectedId)
    ? selectedId
    : submissions[0]?.id ?? null;

  useEffect(() => {
    if (activeSelectedId === null) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoadingDetail(true);
    api<SubmissionDetail>(`/api/admin/essay-submissions/${activeSelectedId}`)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setScores(Object.fromEntries(data.questions.map((question) => [
          question.id,
          question.grade ? String(question.grade.score) : '',
        ])));
        setComments(Object.fromEntries(data.questions.map((question) => [
          question.id,
          question.grade?.comment ?? '',
        ])));
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
    };
  }, [activeSelectedId]);

  const totalPoints = useMemo(
    () => detail?.questions.reduce((sum, question) => sum + question.points, 0) ?? 0,
    [detail],
  );

  const saveGrades = async () => {
    if (!detail || saving) return;
    setError('');
    setSuccess('');
    const grades: { questionId: number; score: number; comment: string }[] = [];
    for (const question of detail.questions) {
      const score = Number(scores[question.id]);
      if (scores[question.id]?.trim() === '' || !Number.isFinite(score) || score < 0 || score > question.points) {
        setError(`${t('admin.reviewManualScore')}: ${question.text}`);
        return;
      }
      grades.push({ questionId: question.id, score, comment: comments[question.id] ?? '' });
    }

    setSaving(true);
    try {
      await api(`/api/admin/essay-submissions/${detail.submission.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ grades }),
      });
      setSuccess(t('admin.reviewSaved'));
      if (status === 'pending_review') {
        // ابقَ في طابور المعلّق وانتقل للمحاولة التالية بدل مغادرة القائمة كاملة.
        const remaining = submissions.filter((item) => item.id !== detail.submission.id);
        setSelectedId(remaining[0]?.id ?? null);
        setLoadingList(true);
        if (page !== 1 && remaining.length === 0) setPage(1);
        else await loadSubmissions();
      } else {
        // إعادة اعتماد/تعديل تصحيح سابق: حدّث التفاصيل في مكانها.
        const updatedDetail = await api<SubmissionDetail>(`/api/admin/essay-submissions/${detail.submission.id}`);
        setDetail(updatedDetail);
        setScores(Object.fromEntries(updatedDetail.questions.map((question) => [
          question.id,
          question.grade ? String(question.grade.score) : '',
        ])));
        setComments(Object.fromEntries(updatedDetail.questions.map((question) => [
          question.id,
          question.grade?.comment ?? '',
        ])));
        setLoadingList(true);
        await loadSubmissions();
      }
    } catch (e) {
      setError((e as Error).message || t('admin.reviewError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader icon="📝" title={t('admin.essayReview')} />

      <div className="flex flex-wrap gap-2">
        {(['pending_review', 'graded'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setLoadingList(true);
              setStatus(value);
              setPage(1);
              setSubmissions([]);
              setTotal(0);
              setSelectedId(null);
              setSuccess('');
            }}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              status === value ? 'btn-fire text-white' : 'btn-ghost-fire'
            }`}
          >
            {value === 'pending_review' ? t('admin.pendingReview') : t('admin.graded')}
          </button>
        ))}
        <button type="button" onClick={() => { setLoadingList(true); void loadSubmissions(); }} className="btn-ghost-fire ms-auto rounded-xl px-4 py-2 text-sm font-bold">
          {t('admin.refresh')}
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.7fr)]">
        <section className="card-fire rounded-2xl p-3">
          {(loadingList || loadingDetail) && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-900/50 rounded-2xl z-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fire-500 border-t-transparent" />
            </div>
          )}
          {loadingList ? (
            <p className="p-4 text-sm text-gray-400">{t('common.loading')}</p>
          ) : submissions.length === 0 ? (
            <p className="p-4 text-center text-sm text-gray-400">{t('admin.reviewEmpty')}</p>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              {submissions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setError(''); setSelectedId(item.id); }}
                  className={`w-full rounded-xl border p-3 text-start transition-colors ${
                    activeSelectedId === item.id ? 'border-fire-500 bg-fire-500/10' : 'border-ink-700 bg-ink-900 hover:border-fire-500/50'
                  }`}
                >
                  <span className="block truncate font-bold">{item.fullName || item.phone}</span>
                  <span className="mt-1 block truncate text-xs text-gray-400">
                    {lang === 'ar' ? item.examTitle : item.examTitleEn || item.examTitle}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    {t('admin.reviewAttempt', { number: item.attemptNumber })} · {submittedDate(item.submittedAt, lang)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!loadingList && total > 30 && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-700 px-1 pt-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => { setLoadingList(true); setPage((current) => Math.max(1, current - 1)); }}
                className="btn-ghost-fire rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                {t('admin.pagePrev')}
              </button>
              <span className="text-xs text-gray-400">
                {t('admin.pageInfo', { page, totalPages: Math.max(1, Math.ceil(total / 30)) })}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(total / 30)}
                onClick={() => { setLoadingList(true); setPage((current) => current + 1); }}
                className="btn-ghost-fire rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                {t('admin.pageNext')}
              </button>
            </div>
          )}
        </section>

        <section className="card-fire min-w-0 rounded-2xl p-4 sm:p-6">
          {activeSelectedId !== null && detail?.submission.id !== activeSelectedId ? (
            <p className="text-gray-400">{t('common.loading')}</p>
          ) : activeSelectedId === null || !detail ? (
            <p className="text-center text-gray-400">{t('admin.reviewEmpty')}</p>
          ) : (
            <div className="space-y-5">
              <div className="border-b border-ink-700 pb-4">
                <h2 className="text-lg font-black">{detail.student.fullName}</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {lang === 'ar' ? detail.exam.title : detail.exam.titleEn || detail.exam.title}
                  {' · '}
                  {t('admin.reviewAttempt', { number: detail.submission.attemptNumber })}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {t('admin.reviewSubmittedAt')}: {submittedDate(detail.submission.submittedAt, lang)}
                  {' · '}
                  {t('exam.mcqScore')}: {detail.submission.mcqScore}% ({detail.submission.mcqCorrect}/{detail.submission.mcqTotal})
                  {detail.submission.score !== null && (
                    <> · {t('exam.finalScore')}: {detail.submission.earnedPoints}/{detail.submission.maximumPoints} ({detail.submission.score}%)</>
                  )}
                </p>
              </div>

              {detail.questions.map((question, index) => (
                <article key={question.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
                  <h3 className="font-bold">
                    {index + 1}. {lang === 'ar' ? question.text : question.textEn || question.text}
                  </h3>
                  <p className="mt-2 text-xs font-bold text-amber-300">
                    {t('admin.maxPoints')}: {question.points}
                  </p>
                  <div className="mt-3 rounded-lg border border-ink-700 bg-ink-950 p-3">
                    <p className="mb-1 text-xs font-bold text-gray-400">{t('admin.reviewStudentAnswer')}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-200">{question.answer || '—'}</p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-gray-300">
                      {t('admin.reviewManualScore')} (0–{question.points})
                      <input
                        type="number"
                        min={0}
                        max={question.points}
                        step="0.1"
                        value={scores[question.id] ?? ''}
                        onChange={(event) => setScores((current) => ({ ...current, [question.id]: event.target.value }))}
                        className="input-fire mt-1.5 w-full rounded-xl px-3 py-2.5"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-gray-300">
                      {t('admin.reviewComment')}
                      <textarea
                        rows={2}
                        value={comments[question.id] ?? ''}
                        onChange={(event) => setComments((current) => ({ ...current, [question.id]: event.target.value }))}
                        className="input-fire mt-1.5 w-full rounded-xl px-3 py-2.5"
                      />
                    </label>
                  </div>
                </article>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-gray-400">{t('admin.maxPoints')}: {totalPoints}</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveGrades()}
                  className="btn-fire rounded-xl px-5 py-2.5 font-bold text-white disabled:opacity-50"
                >
                  {saving
                    ? t('admin.reviewSaving')
                    : detail.submission.status === 'graded'
                      ? t('admin.saveReview')
                      : t('admin.approveResult')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
