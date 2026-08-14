import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { api } from '../api/client';
import Sparkles from '../components/Sparkles';

interface TopStudent {
  id: number;
  name: string;
  image: string;
  rank: number;
  grade: string;
  gradeName: string;
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function TopStudents() {
  const { t, lang } = useLang();
  const [students, setStudents] = useState<TopStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ students: TopStudent[] }>('/api/top-students')
      .then((d) => setStudents(d.students))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const bac1 = students.filter((s) => s.grade === 'bac1');
  const bac2 = students.filter((s) => s.grade === 'bac2');

  const share = async () => {
    const url = window.location.href;
    const text = `${t('top.shareText')} 🏆`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t('top.title'), text, url });
        return;
      } catch {
        /* أُلغيت المشاركة */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* تجاهل */
    }
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-fire-500/25 shadow-2xl shadow-fire-950/60"
      >
        <img
          src="/login-hero.png"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/85 via-ink-950/55 to-ink-950/92" />
        <Sparkles />

        <div className="relative z-10 p-6 sm:p-8 md:p-10">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 18 }}
                className="h-16 w-16 overflow-hidden rounded-full border-2 border-fire-500/40 bg-ink-800 shadow-xl shadow-fire-900/50 animate-flame sm:h-20 sm:w-20"
              >
                <img src="/owner.png" alt={t('top.founder')} className="h-full w-full object-cover" />
              </motion.div>
              <div>
                <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-2xl font-black sm:text-3xl">
                  <span className="text-fire-gradient">{t('top.title')}</span>
                </motion.h1>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-black">{lang === 'ar' ? 'مصطفى بكير' : 'Mostafa Bakir'}</span>
                </motion.div>
              </div>
            </div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              onClick={share}
              className="btn-fire flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            >
              {copied ? '✅ ' + t('top.shareCopied') : `📣 ${t('top.share')}`}
            </motion.button>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mb-8 max-w-xl text-gray-200"
          >
            {t('top.subtitle')} — {lang === 'ar' ? 'اضغط على اسم أي طالب لعرض شهادته وقِسمها' : 'Click any student name to view and share their certificate'}
          </motion.p>

          {error && <div className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

          {loading ? (
            <p className="text-center text-gray-300">{t('common.loading')}</p>
          ) : students.length === 0 ? (
            <p className="rounded-2xl border border-ink-600 bg-ink-900/80 p-10 text-center text-gray-300">{t('top.empty')}</p>
          ) : (
            <div className="space-y-8">
              <GradeSection key="bac2" title={t('top.bac2Title')} students={bac2} accent="ember" />
              <GradeSection key="bac1" title={t('top.bac1Title')} students={bac1} accent="sky" />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function GradeSection({ title, students, accent }: { title: string; students: TopStudent[]; accent: 'sky' | 'ember' }) {
  if (students.length === 0) return null;
  const sorted = [...students].sort((a, b) => a.rank - b.rank);
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const header = {
    sky: { icon: '🔵', ring: 'ring-sky-500/40', grad: 'from-sky-500/20 to-transparent', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
    ember: { icon: '🟠', ring: 'ring-ember-500/40', grad: 'from-ember-500/20 to-transparent', badge: 'bg-ember-500/15 text-ember-300 border-ember-500/40' },
  }[accent];

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-950/60 p-5 backdrop-blur-md sm:p-7"
    >
      <div className={`pointer-events-none absolute -top-24 -end-24 h-56 w-56 rounded-full bg-gradient-to-br ${header.grad} blur-3xl`} />
      <div className="pointer-events-none absolute -bottom-24 -start-20 h-52 w-52 rounded-full bg-gradient-to-tr from-fire-500/10 to-transparent blur-3xl" />
      <div className="relative">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-black md:text-3xl">
            {header.icon} {title}
          </h2>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${header.badge}`}>{students.length} 🎓</span>
        </div>

        {podium.length > 0 && (
          <div className="mx-auto mb-8 flex max-w-xl items-end justify-center gap-3 sm:gap-4">
            {podium[1] && <PodiumCol student={podium[1]} height="h-28" place="2nd" />}
            {podium[0] && <PodiumCol student={podium[0]} height="h-36" place="1st" />}
            {podium[2] && <PodiumCol student={podium[2]} height="h-24" place="3rd" />}
          </div>
        )}

        {rest.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((s, i) => (
              <StudentCard key={s.id} s={s} i={i} />
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}

const PODIUM_CLS: Record<string, { base: string; avatar: string }> = {
  '1st': { base: 'bg-gradient-to-b from-amber-400/90 to-amber-600/80 text-ink-950', avatar: 'ring-amber-400/70 border-amber-300' },
  '2nd': { base: 'bg-gradient-to-b from-slate-300/90 to-slate-500/80 text-ink-950', avatar: 'ring-slate-300/60 border-slate-200' },
  '3rd': { base: 'bg-gradient-to-b from-ember-400/90 to-ember-600/80 text-ink-950', avatar: 'ring-ember-500/70 border-ember-300' },
};

function PodiumCol({ student, height, place }: { student: TopStudent; height: string; place: '1st' | '2nd' | '3rd' }) {
  const { t } = useLang();
  const cls = PODIUM_CLS[place];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: place === '1st' ? 0.1 : 0.2 }}
      className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
    >
      <span className="text-4xl drop-shadow-lg">{MEDALS[student.rank] ?? `#${student.rank}`}</span>
      <div className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-ink-800 ring-2 ${cls.avatar}`}>
        {student.image ? <img src={student.image} alt={student.name} className="h-full w-full object-cover" /> : <DefaultAvatar />}
      </div>
      <Link
        to={`/top-students/${student.id}`}
        title={t('top.viewCertificate')}
        className="w-full truncate text-sm font-extrabold text-gray-100 transition-colors hover:text-fire-400 hover:underline"
      >
        {student.name}
      </Link>
      <Link to={`/top-students/${student.id}`} className="mb-1.5 rounded-full border border-fire-500/50 bg-gradient-to-r from-fire-600/30 to-ember-500/30 px-4 py-1.5 text-xs font-black text-fire-200 shadow-lg shadow-fire-950/50 transition-all hover:-translate-y-0.5 hover:border-fire-400 hover:text-white hover:shadow-xl">
        🎓 {t('top.viewCertificate')}
      </Link>
      <div className={`flex w-full items-end justify-center rounded-t-2xl pt-2 text-lg font-black ${height} ${cls.base}`}>
        <span className="pb-1">{place === '1st' ? '🥇' : place === '2nd' ? '🥈' : '🥉'}</span>
      </div>
    </motion.div>
  );
}

function StudentCard({ s, i }: { s: TopStudent; i: number }) {
  const { t } = useLang();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: i * 0.05 }}
      className="card-fire card-fire-hover flex items-center gap-4 rounded-2xl p-4"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 ring-2 ring-fire-500/30">
        {s.image ? <img src={s.image} alt={s.name} className="h-full w-full object-cover" /> : <DefaultAvatar />}
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/top-students/${s.id}`} className="block truncate font-extrabold text-gray-100 transition-colors hover:text-fire-400 hover:underline" title={s.name}>
          {s.name}
        </Link>
        <div className="text-xs text-gray-400">
          {s.gradeName} — #{s.rank}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-3xl drop-shadow">{MEDALS[s.rank] ?? `#${s.rank}`}</span>
        <Link
          to={`/top-students/${s.id}`}
          className="rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/25 to-ember-500/25 px-3.5 py-1 text-xs font-black text-amber-200 transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:text-white hover:shadow-lg hover:shadow-amber-950/40"
        >
          🎓 {t('top.viewCertificate')}
        </Link>
      </div>
    </motion.div>
  );
}

function DefaultAvatar() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-gray-500" fill="currentColor">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
    </svg>
  );
}