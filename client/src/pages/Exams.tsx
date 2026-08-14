import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { api } from '../api/client';

interface Exam {
  id: number;
  title: string;
  titleEn: string;
  courseId: number | null;
  questionsCount: number;
  timeLimit: number | null;
  passingScore: number;
  taken: boolean;
  bestScore: number | null;
  attempts: number;
  allowRetake?: boolean;
}

export default function Exams() {
  const { t, lang } = useLang();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ exams: Exam[] }>('/api/exams')
      .then((d) => setExams(d.exams))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black sm:text-3xl">📝 {t('exam.title')}</h1>
        <p className="mt-1 text-gray-400">{t('home.subtitle')}</p>
      </motion.div>

      {loading ? (
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
