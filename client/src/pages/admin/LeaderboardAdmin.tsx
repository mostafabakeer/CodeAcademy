import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import GradeBadge from '../../components/GradeBadge';

interface ExamOption {
  id: number;
  title: string;
  titleEn: string;
  grade: string;
  order: number;
}

interface ResultsExam {
  id: number;
  title: string;
  titleEn: string;
  grade: string;
}

interface ResultRow {
  userId: number;
  fullName: string;
  phone: string;
  grade: string;
  best: number;
  score: number;
  correct: number;
  total: number;
  attempts: number;
  at: number;
  rank: number;
}

const PAGE_SIZE = 30;
const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function fmtDate(at: number, lang: 'ar' | 'en'): string {
  if (!at) return '—';
  return new Date(at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function LeaderboardAdmin() {
  const { t, lang } = useLang();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [exam, setExam] = useState<ResultsExam | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [examId, debounced]);

  const load = useCallback(() => {
    if (!examId) return;
    setLoading(true);
    setError('');
    const search = debounced.trim() ? `&search=${encodeURIComponent(debounced.trim())}` : '';
    api<{ exam: ResultsExam; results: ResultRow[]; total: number; page: number }>(
      `/api/admin/exam-results/${examId}?page=${page}&limit=${PAGE_SIZE}${search}`
    )
      .then((d) => {
        setResults(d.results);
        setTotal(d.total);
        setExam(d.exam);
        if (d.page !== page) setPage(d.page);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [examId, page, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<{ exams: ExamOption[] }>('/api/admin/exams/select')
      .then((d) => {
        setExams(d.exams);
        if (d.exams.length > 0) setExamId(d.exams[0].id);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showTop3 = page === 1 && !debounced.trim();
  const top3 = showTop3 ? results.slice(0, 3) : [];
  const table = showTop3 ? results.slice(3) : results;
  const activeExam = examId !== null ? (exams.find((e) => e.id === examId) ?? null) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">📈 {t('admin.examResults')}</h1>
        <select
          className="input-fire min-w-52 rounded-xl px-4 py-2.5 text-sm"
          value={examId ?? ''}
          onChange={(e) => setExamId(Number(e.target.value))}
        >
          {exams.length === 0 && <option value="">{t('admin.selectExam')}</option>}
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {lang === 'ar' || !e.titleEn ? e.title : e.titleEn || e.title}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      <div className="relative">
        <input
          className="input-fire w-full rounded-xl px-4 py-2.5 text-sm"
          placeholder={t('admin.resultsSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>📌 {activeExam ? (lang === 'ar' || !activeExam.titleEn ? activeExam.title : activeExam.titleEn) : '—'}</span>
        {!loading && <span>{t('admin.resultsTotal')}: <b className="text-gray-200">{total}</b></span>}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-ink-900" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-10 text-center text-gray-400">{t('admin.resultsEmpty')}</p>
      ) : (
        <>
          {top3.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {top3.map((r) => (
                <motion.div
                  key={r.userId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card-fire rounded-2xl p-4 text-center"
                >
                  <div className="text-3xl drop-shadow-lg">{MEDALS[r.rank]}</div>
                  <div className="mt-1 truncate font-extrabold text-gray-100" title={r.fullName}>{r.fullName}</div>
                  <div className="mt-1 text-xs text-gray-400" dir="ltr">{r.phone || '—'}</div>
                  <div className="mt-2 inline-block rounded-full bg-amber-500/20 px-3 py-1 text-sm font-black text-amber-300">{r.best}%</div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="card-fire overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-start text-gray-400">
                  <th className="px-4 py-3 text-start">{t('admin.resultRank')}</th>
                  <th className="px-4 py-3 text-start">{t('admin.resultStudent')}</th>
                  <th className="px-4 py-3 text-start">{t('admin.resultGrade')}</th>
                  <th className="px-4 py-3 text-center">{t('admin.resultBest')}</th>
                  <th className="px-4 py-3 text-center">{t('admin.resultCorrect')}</th>
                  <th className="px-4 py-3 text-center">{t('admin.resultAttempts')}</th>
                  <th className="px-4 py-3 text-end">{t('admin.resultAt')}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <motion.tr key={r.userId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="border-b border-ink-800 hover:bg-ink-850">
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-fire-500/15 px-2.5 py-0.5 font-black text-fire-300">#{r.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{r.fullName || '—'}</div>
                      <div className="text-xs text-gray-500" dir="ltr">{r.phone || '—'}</div>
                    </td>
                    <td className="px-4 py-3"><GradeBadge grade={r.grade} /></td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-black text-emerald-300">{r.best}%</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">{r.correct}/{r.total}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{r.attempts}</td>
                    <td className="px-4 py-3 text-end text-gray-400">{fmtDate(r.at, lang)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-400">{t('admin.pageInfo', { page, totalPages: maxPage })}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
                >
                  {t('admin.pagePrev')}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                  disabled={page >= maxPage}
                  className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
                >
                  {t('admin.pageNext')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}