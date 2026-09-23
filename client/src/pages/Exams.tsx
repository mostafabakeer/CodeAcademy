import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { loadBootstrap, type ExamListItem, type Exam } from '../lib/content';
import DoctorCode from '../components/DoctorCode';

export default function Exams() {
  const { t, lang } = useLang();
  const { user, examResults } = useAuth();
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError('');

    const merge = (list: Exam[]) => {
      const map = new Map(examResults.map((r) => [r.examId, r]));
      const items: ExamListItem[] = list.map((e) => ({
        ...e,
        taken: !!map.get(e.id),
        bestScore: map.get(e.id)?.best ?? null,
        attempts: map.get(e.id)?.attempts ?? 0,
      }));
      if (active) setExams(items);
    };

    api<{ exams: Exam[] }>('/api/exams')
      .then((d) => merge(d.exams ?? []))
      .catch(() =>
        // آخر حل: نرجع للنسخة المخزنة من bootstrap حتى لا تفرغ الصفحة فجأة
        loadBootstrap(userId)
          .then((b) => merge(b.exams))
          .catch(() => {
            if (!active) return;
            setExams([]);
            setError(t('exam.loadError'));
          })
      )
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, examResults, t, reload]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {/* <h1 className="text-2xl font-black sm:text-3xl">📝 {t('exam.title')}</h1> */}
        {/* <p className="mt-1 text-gray-400">{t('home.subtitle')}</p> */}
      </motion.div>

      {/* تحفيز دكتور كود */}
      {!loading && exams.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pattern-dots relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl border border-fire-500/25 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-5 sm:p-6"
        >
          <div className="pointer-events-none absolute -top-14 -end-14 h-44 w-44 rounded-full bg-fire-600/25 blur-3xl" />
          <div className="relative flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:flex-row sm:text-start">
            <div className="shrink-0">
              <DoctorCode size="sm" />
            </div>
            <div>
              <h2 className="text-lg font-black text-fire-gradient sm:text-xl " > {t('exam.cheerTitle')}</h2>
              {/* <p className="mt-1 text-sm text-gray-400">{t('exam.cheerMsg')}</p> */}
            </div>
          </div>
        </motion.div>
      )}

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-fire-500/30 bg-fire-950/30 p-8 text-center">
          <span className="text-3xl">⚠️</span>
          <p className="text-gray-300">{error}</p>
          <button
            onClick={() => setReload((x) => x + 1)}
            className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          >
            ⟳ {t('exam.retry')}
          </button>
        </div>
      ) : loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : exams.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('exam.noExams')}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((e, i) => {
            const passed = e.taken && e.bestScore !== null && e.bestScore >= e.passingScore;
            const canRetake = !!e.allowRetake;
            return (
              <motion.div key={e.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link to={`/exams/${e.id}`} className="card-fire card-fire-hover flex h-full flex-col rounded-3xl p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-fire-600/30 to-ember-500/30 text-2xl">📋</div>
                    {e.taken && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-fire-500/20 text-fire-300'}`}>
                        {passed ? '✓ ' + t('exam.passed') : t('exam.failed')}
                      </span>
                    )}
                  </div>
                  <h2 className="font-extrabold">{lang === 'ar' ? e.title : e.titleEn}</h2>
                  <div className="mt-3 space-y-1 text-sm text-gray-400">
                    <div>❓ {e.questionsCount} {t('exam.questionsCount')}</div>
                    {e.timeLimit && <div>⏱️ {e.timeLimit} {t('exam.timeLimit')}</div>}
                    <div>
                      {e.taken ? (
                        <>
                          🏆 {t('exam.bestScore')}: <span className="font-bold text-fire-400">{e.bestScore}%</span> · {e.attempts} {t('exam.attempts')}
                        </>
                      ) : (
                        t('exam.notTaken')
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex-1" />
                  {e.taken && !canRetake ? (
                    <span className="rounded-xl border border-ink-600 bg-ink-900 px-4 py-2 text-center text-sm font-bold text-gray-400">
                      {t('exam.doneOnce')}
                    </span>
                  ) : (
                    <span className="btn-fire rounded-xl px-4 py-2 text-center text-sm font-bold text-white">
                      {e.taken ? t('exam.retake') : t('exam.take')}
                    </span>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
