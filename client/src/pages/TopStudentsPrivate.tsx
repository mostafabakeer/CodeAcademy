import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { useUser, useProgress } from '../store/authStore';
import { useBootstrapData } from '../lib/useBootstrapData';
import {
  loadTopStudents,
  loadLatestExamTop,
  loadMyExamRank,
  type TopStudent,
  type LatestExamTop,
  type MyExamRank,
} from '../lib/content';
import { StaleNotice, LoadError } from '../components/PageStatus';
import DoctorCode from '../components/DoctorCode';
import Sparkles from '../components/Sparkles';
import { MEDALS, TopStudentCard, LatestExamCard } from '../components/TopStudentsShared';

const EMPTY_RANK: MyExamRank = {
  examId: null,
  examTitle: '',
  examTitleEn: '',
  score: null,
  rank: null,
  total: 0,
  taken: false,
};

export default function TopStudentsPrivate() {
  const { t, lang } = useLang();
  const user = useUser();
  const { stats } = useProgress();
  const { data: boot, error, retry } = useBootstrapData(user?.id);

  const [siteTop, setSiteTop] = useState<TopStudent[]>([]);
  const [examTop, setExamTop] = useState<Record<string, LatestExamTop>>({});
  const [myRank, setMyRank] = useState<MyExamRank>(EMPTY_RANK);
  const [loadingTop, setLoadingTop] = useState(true);
  const [loadingRank, setLoadingRank] = useState(true);
  const [topError, setTopError] = useState('');
  const [rankError, setRankError] = useState('');

  const userId = user?.id ?? null;
  const grade = user?.grade;

  // أوائل الموقع + أوائل آخر امتحان (عامّتان، بلا كاش متبادل مع الترتيب الشخصي)
  useEffect(() => {
    let alive = true;
    setLoadingTop(true);
    setTopError('');
    Promise.all([loadTopStudents(), loadLatestExamTop()])
      .then(([s, l]) => {
        if (!alive) return;
        setSiteTop(s);
        setExamTop(l);
      })
      .catch((e: Error) => {
        if (alive) setTopError(e.message);
      })
      .finally(() => {
        if (alive) setLoadingTop(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // ترتيبي الحقيقي في آخر امتحان — يُعاد تحميله عند تغيّر المستخدم
  useEffect(() => {
    if (userId == null) {
      setMyRank(EMPTY_RANK);
      setLoadingRank(false);
      return;
    }
    let alive = true;
    setLoadingRank(true);
    setRankError('');
    loadMyExamRank(userId, true)
      .then((r) => {
        if (alive) setMyRank(r);
      })
      .catch((e: Error) => {
        if (alive) setRankError(e.message);
      })
      .finally(() => {
        if (alive) setLoadingRank(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const allSiteTop = useMemo(() => siteTop.slice().sort((a, b) => a.rank - b.rank), [siteTop]);
  const watchHours = stats ? Math.round(stats.watchRatio * (stats.totalLessons * 10)) / 10 : 0;

  const examName = myRank && (lang === 'ar' || !myRank.examTitleEn) ? myRank.examTitle : myRank?.examTitleEn || myRank?.examTitle;
  const gradeLabel = grade === 'bac1' ? t('auth.bac1') : t('auth.bac2');

  // المتصدر في آخر امتحان لنفس المرحلة (من نفس المصدر official)
  const myExamEntry = grade ? examTop?.[grade] : undefined;
  const leader = myExamEntry?.top?.[0] ?? null;
  const pointsToFirst = leader && myRank.score != null ? Math.max(0, leader.score - myRank.score) : null;

  const percentile =
    myRank.rank != null && myRank.total > 0
      ? Math.round(((myRank.total - myRank.rank + 1) / myRank.total) * 100)
      : null;

  return (
    <div className="space-y-8">
      {error && boot && <StaleNotice message={error} onRetry={retry} />}

      {/* ١) ترتيبي الحقيقي في آخر امتحان — بدل الشهادة */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="pattern-dots relative overflow-hidden rounded-3xl border border-fire-500/25 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -top-24 -end-24 h-72 w-72 rounded-full bg-fire-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-10 h-72 w-72 rounded-full bg-ember-500/20 blur-3xl" />
        <Sparkles behind />

        <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:items-center lg:justify-between lg:text-start">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-wide text-ember-400">📊 {t('top.myRankTitle')}</p>
            <h1 className="mt-2 break-words text-2xl font-black sm:text-4xl md:text-5xl">
              {user?.fullName} <span className="text-fire-shine">🏆</span>
            </h1>
            <p className="mt-3 text-gray-400">{t('top.myRankSubtitle')}</p>

            {loadingRank ? (
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <div className="h-24 w-72 animate-pulse rounded-2xl bg-ink-900/70" />
              </div>
            ) : myRank.examId == null ? (
              <div className="mt-6 rounded-2xl border border-ink-600 bg-ink-900/60 px-5 py-4 text-start">
                <div className="text-sm font-bold text-gray-300">🕒 {t('top.noExamYet')}</div>
              </div>
            ) : myRank.rank == null ? (
              <div className="mt-6 rounded-2xl border border-ink-600 bg-ink-900/60 px-5 py-4 text-start">
                <div className="text-sm font-bold text-gray-300">
                  🎯 {t('top.latestExam')}: <span className="text-gray-100">{examName}</span>
                </div>
                <div className="mt-2 text-sm text-gray-400">
                  {myRank.taken ? t('top.rankUnavailable') : t('top.notTakenYet')}
                </div>
                <div className="mt-1 text-xs text-gray-500">{myRank.taken ? t('top.rankUnavailableHint') : t('top.notTakenHint')}</div>
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                  <div className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-fire-500/20 bg-ink-900/70 px-5 py-3">
                    <div>
                      <div className="text-xs text-gray-400">{t('top.myRank')}</div>
                      <div className="text-3xl font-black text-fire-gradient">
                        #{myRank.rank}
                        {MEDALS[myRank.rank] && <span className="ms-1 text-2xl">{MEDALS[myRank.rank]}</span>}
                      </div>
                    </div>
                    <div className="h-8 w-px bg-fire-500/25" />
                    <div>
                      <div className="text-xs text-gray-400">{t('top.outOf')}</div>
                      <div className="text-3xl font-black text-fire-gradient">{myRank.total}</div>
                    </div>
                    {myRank.score != null && (
                      <>
                        <div className="h-8 w-px bg-fire-500/25" />
                        <div>
                          <div className="text-xs text-gray-400">{t('top.myRankScore')}</div>
                          <div className="text-3xl font-black text-fire-gradient">{myRank.score}%</div>
                        </div>
                      </>
                    )}
                    {percentile != null && (
                      <>
                        <div className="h-8 w-px bg-fire-500/25" />
                        <div>
                          <div className="text-xs text-gray-400">{t('top.percentile')}</div>
                          <div className="text-2xl font-black text-fire-gradient">Top {percentile}%</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-sm text-gray-400">
                  🎯 {t('top.myRankExam')}: <span className="font-bold text-gray-200">{examName}</span> · {gradeLabel}
                </p>
              </>
            )}

            {rankError && <p className="mt-3 text-xs text-fire-300">⚠️ {t('top.myRankError')}</p>}
          </div>

          <div className="relative shrink-0">
            <DoctorCode size="lg" />
            <div className="pointer-events-none absolute inset-0 m-auto h-40 w-40 rounded-full bg-fire-500/10 blur-2xl" />
          </div>
        </div>

        {/* الفارق عن المتصدر — أرقام حقيقية من نفس الامتحان */}
        {myRank.rank != null && leader && myRank.rank > 1 && pointsToFirst != null && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative mt-8 rounded-2xl border border-ember-500/30 bg-gradient-to-r from-ember-500/10 via-transparent to-transparent p-5"
          >
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ember-500/20">
                  <span className="text-3xl">🥇</span>
                </div>
                <div className="text-start">
                  <div className="text-xs text-gray-400">{t('top.leaderOfExam')}</div>
                  <div className="font-bold text-ember-300">{leader.fullName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-ember-400">
                <div className="text-3xl font-black">{pointsToFirst}</div>
                <div className="text-sm">{t('top.pointsToFirst')}</div>
              </div>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
                className="relative h-3 w-full max-w-xs overflow-hidden rounded-full bg-ink-800"
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.max(10, Math.min(90, leader.score ? (myRank.score ?? 0) * (100 / leader.score) : 10))}%`,
                  }}
                  transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-ember-500 to-ember-400"
                />
              </motion.div>
            </div>
          </motion.div>
        )}

        {myRank.rank === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative mt-8 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-transparent to-transparent p-5 text-center font-black text-amber-200 sm:text-start"
          >
            🥆 {t('top.firstPlaceNow')}
          </motion.div>
        )}
      </motion.section>

      {/* ٢) أوائل الموقع على مر الزمان */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-5"
      >
        <div className="flex flex-col items-center gap-2 text-center md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-black md:text-2xl">🏆 {t('top.topSectionAllTime')}</h2>
          <Link to="/top-students" className="btn-ghost-fire rounded-xl px-4 py-2 text-sm font-bold">
            {t('top.viewFullRanking')}
          </Link>
        </div>

        {loadingTop ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-800/60" />
            ))}
          </div>
        ) : topError ? (
          <LoadError message={topError} onRetry={retry} />
        ) : allSiteTop.length === 0 ? (
          <p className="card-fire rounded-2xl px-4 py-6 text-center text-sm text-gray-400">{t('top.empty')}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allSiteTop.slice(0, 6).map((s, i) => (
              <TopStudentCard key={s.id} s={s} i={i} to={`/top-students/${s.id}`} />
            ))}
          </div>
        )}

        {allSiteTop.length > 6 && (
          <div className="text-center">
            <Link to="/top-students" className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-base font-bold text-white">
              {t('top.viewAll')}
            </Link>
          </div>
        )}
      </motion.section>

      {/* ٣) أوائل آخر امتحان لكل مرحلة */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-5"
      >
        <div className="flex flex-col items-center gap-2 text-center md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black md:text-2xl">⚡ {t('top.topSectionExamTop')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('top.topSectionExamTopSub')}</p>
          </div>
          <span className="rounded-full border border-dashed border-white/25 px-3 py-1 text-xs font-bold text-gray-300">
            {t('top.subsidiaryBadge')}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <LatestExamCard
            entry={examTop?.bac1}
            loading={loadingTop}
            error={topError}
            accent="sky"
            grade="bac1"
            highlightUserId={grade === 'bac1' ? (userId ?? undefined) : undefined}
          />
          <LatestExamCard
            entry={examTop?.bac2}
            loading={loadingTop}
            error={topError}
            accent="ember"
            grade="bac2"
            highlightUserId={grade === 'bac2' ? (userId ?? undefined) : undefined}
          />
        </div>
      </motion.section>

      {/* إحصائياتي */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {[
          { icon: '📊', label: t('top.myPoints'), value: `${stats?.points ?? 0}`, delay: 0 },
          { icon: '🎬', label: t('home.stats.watchTime'), value: `${watchHours} ${t('home.stats.watchUnit')}`, delay: 0.05 },
          { icon: '✅', label: t('home.stats.completedLessons'), value: `${stats?.completedLessons ?? 0}/${stats?.totalLessons ?? 0}`, delay: 0.1 },
          { icon: '📝', label: t('home.stats.examAvg'), value: `${stats?.examAvg ?? 0}%`, delay: 0.15 },
        ].map((a, i) => (
          <motion.div key={a.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: a.delay + i * 0.06 }}>
            <div className="card-fire card-fire-hover flex items-center gap-3 rounded-2xl p-4">
              <span className="text-2xl">{a.icon}</span>
              <div>
                <div className="text-2xl font-black text-fire-gradient">{a.value}</div>
                <div className="text-xs text-gray-400">{a.label}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.section>

      {/* إجراءات سريعة */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Link to="/courses" className="card-fire card-fire-hover flex flex-col items-center gap-3 rounded-2xl p-5 text-center">
          <span className="text-3xl">📚</span>
          <span className="text-sm font-bold text-gray-200">{t('home.goToCourses')}</span>
        </Link>
        <Link to="/codelab" className="card-fire card-fire-hover flex flex-col items-center gap-3 rounded-2xl p-5 text-center">
          <span className="text-3xl">💻</span>
          <span className="text-sm font-bold text-gray-200">{t('home.goToCodeLab')}</span>
        </Link>
        <Link to="/exams" className="card-fire card-fire-hover flex flex-col items-center gap-3 rounded-2xl p-5 text-center">
          <span className="text-3xl">📝</span>
          <span className="text-sm font-bold text-gray-200">{t('home.goToExams')}</span>
        </Link>
        <Link to="/notes" className="card-fire card-fire-hover flex flex-col items-center gap-3 rounded-2xl p-5 text-center">
          <span className="text-3xl">📖</span>
          <span className="text-sm font-bold text-gray-200">{t('home.goToNotes')}</span>
        </Link>
      </motion.section>
    </div>
  );
}
