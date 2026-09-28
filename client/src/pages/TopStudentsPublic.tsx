import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { loadTopStudents, loadLatestExamTop, loadExamLeaderboards, type TopStudent, type LatestExamTop, type ExamLeaderboard } from '../lib/content';
import Sparkles from '../components/Sparkles';
import DoctorCode from '../components/DoctorCode';
import { TopStudentCard, LatestExamCard, ExamLeaderboardCard } from '../components/TopStudentsShared';

export default function TopStudentsPublic() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [students, setStudents] = useState<TopStudent[]>([]);
  const [latestTop, setLatestTop] = useState<Record<string, LatestExamTop>>({});
  const [boards, setBoards] = useState<ExamLeaderboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    // كل مصدر مستقل: فشل أحدها لا يُسقط الصفحة، وكل واحد له كاش على حدة
    Promise.allSettled([loadTopStudents(), loadLatestExamTop(), loadExamLeaderboards()])
      .then(([s, l, b]) => {
        if (!alive) return;
        if (s.status === 'fulfilled') setStudents(s.value);
        if (l.status === 'fulfilled') setLatestTop(l.value);
        if (b.status === 'fulfilled') setBoards(b.value);
        setError(s.status === 'rejected' ? (s.reason as Error).message : '');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const all = students.slice().sort((a, b) => a.rank - b.rank);

  const handleLogin = () => navigate('/login');
  const handleRegister = () => navigate('/register');

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-fire-500/25 shadow-2xl shadow-fire-950/60"
      >
        <img
          src="/login-hero.png"
          alt=""
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/85 via-ink-950/55 to-ink-950/92" />
        <Sparkles />

        <div className="relative z-10 p-6 sm:p-8 md:p-10">
          <div className="mb-8 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 18 }}
                className="h-16 w-16 overflow-hidden rounded-full border-2 border-fire-500/40 bg-ink-800 shadow-xl shadow-fire-900/50 animate-flame sm:h-20 sm:w-20"
              >
                <img src="/owner.png" alt={t('top.founder')} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </motion.div>
              <div>
                <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-2xl font-black sm:text-3xl">
                  <span className="text-fire-gradient">{t('top.title')}</span>
                </motion.h1>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                  <span className="text-sm font-black">{lang === 'ar' ? 'مصطفى بكير' : 'Mostafa Bakir'}</span>
                  <span className="text-xs text-gray-400">{t('top.founderTitle')}</span>
                </motion.div>
              </div>
            </div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex flex-col gap-3 sm:flex-row">
              <Link to="/register" onClick={handleRegister} className="btn-fire flex items-center gap-2 rounded-xl px-6 py-3 text-base font-bold text-white">
                🚀 {t('top.joinNow')}
              </Link>
              <Link to="/login" onClick={handleLogin} className="btn-ghost-fire flex items-center gap-2 rounded-xl px-6 py-3 text-base font-bold">
                🔐 {t('nav.login')}
              </Link>
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mx-auto max-w-3xl text-center text-lg font-bold leading-relaxed text-gray-200 sm:text-left"
          >
            {t('top.publicSubtitle')}
          </motion.p>
        </div>
      </motion.section>

      {/* أوائل الموقع على مر الزمان — مباشرة تحت الـ hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="space-y-5"
      >
        <div className="flex flex-col items-center gap-2 text-center md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-black md:text-2xl">🏆 {t('top.allTimeTitle')}</h2>
          <Link to="/login" className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold">
            {t('top.viewFullRanking')}
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-800/60" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-fire-500/30 bg-fire-950/30 px-4 py-6 text-center text-sm text-fire-300">
            ⚠️ {t('top.empty')}
          </div>
        ) : all.length === 0 ? (
          <p className="card-fire rounded-2xl px-4 py-6 text-center text-sm text-gray-400">{t('top.empty')}</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {all.slice(0, 6).map((s, i) => (
                <TopStudentCard key={s.id} s={s} i={i} to={`/top-students/${s.id}`} />
              ))}
            </div>

            {all.length > 6 && (
              <div className="text-center">
                <Link to="/login" className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-base font-bold text-white">
                  {t('top.viewAll')}
                </Link>
              </div>
            )}
          </>
        )}
      </motion.section>

      {/* أوائل آخر امتحان لكل مرحلة */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="space-y-5"
      >
        <div className="flex flex-col items-center gap-2 text-center md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black md:text-2xl">⚡ {t('top.autoTitle')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('top.autoSubtitle')}</p>
          </div>
          <span className="rounded-full border border-dashed border-white/25 px-3 py-1 text-xs font-bold text-gray-300">
            {t('top.subsidiaryBadge')}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <LatestExamCard entry={latestTop?.bac1} loading={loading} error={error} accent="sky" grade="bac1" />
          <LatestExamCard entry={latestTop?.bac2} loading={loading} error={error} accent="ember" grade="bac2" />
        </div>
      </motion.section>

      {/* أوائل كل امتحان — أعلى ٣ لكل امتحان، الأحدث أولًا */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="space-y-5"
      >
        <div className="flex flex-col items-center gap-2 text-center md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black md:text-2xl">📚 {t('top.everyExamTitle')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('top.everyExamSubtitle')}</p>
          </div>
          <span className="rounded-full border border-dashed border-white/25 px-3 py-1 text-xs font-bold text-gray-300">
            {t('top.everyExamParticipants')}
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-ink-800/60" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <p className="card-fire rounded-2xl px-4 py-8 text-center text-sm text-gray-400">
            {t('top.everyExamEmpty')}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {boards.map((b, i) => (
              <ExamLeaderboardCard key={b.examId} board={b} i={i} />
            ))}
          </div>
        )}
      </motion.section>

      {/* CTA Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-fire-500/25 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-6 sm:p-8 text-center"
      >
        <div className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-fire-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-10 h-72 w-72 rounded-full bg-ember-500/20 blur-3xl" />
        <Sparkles />

        <div className="relative z-10">
          <DoctorCode size="md" className="mx-auto mb-4" />
          <h3 className="text-2xl font-black sm:text-3xl">{t('top.ctaTitle')}</h3>
          <p className="mx-auto mt-3 max-w-xl text-gray-300">{t('top.ctaSubtitle')}</p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/register" onClick={handleRegister} className="btn-fire rounded-xl px-8 py-3 text-lg font-bold text-white">
              🚀 {t('top.joinNow')}
            </Link>
            <Link to="/login" onClick={handleLogin} className="btn-ghost-fire rounded-xl px-8 py-3 text-lg font-bold">
              {t('nav.login')}
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
