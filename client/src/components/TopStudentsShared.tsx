import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import type { TopStudent, LatestExamTop } from '../lib/content';

export const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function DefaultAvatar() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-gray-500" fill="currentColor">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
    </svg>
  );
}

/** بطاقة طالب من «أوائل الموقع على مر الزمان». */
export function TopStudentCard({ s, i, to }: { s: TopStudent; i: number; to?: string }) {
  const { t, lang } = useLang();

  const inner = (
    <div className="card-fire card-fire-hover flex items-center gap-4 rounded-2xl p-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 ring-2 ring-fire-500/30">
        {s.image ? (
          <img src={s.image} alt={s.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <DefaultAvatar />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-extrabold text-gray-100">{s.name}</div>
        <div className="text-xs text-gray-400">
          {s.gradeName || s.grade} — #{s.rank}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-3xl drop-shadow">{MEDALS[s.rank] ?? `#${s.rank}`}</span>
        {to ? (
          <span className="rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/25 to-ember-500/25 px-3 py-1 text-xs font-black text-amber-200">
            🏆 {t('top.viewCertificate')}
          </span>
        ) : (
          <span className="rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/25 to-ember-500/25 px-3 py-1 text-xs font-black text-amber-200">
            🏆 {lang === 'ar' ? 'من الأوائل' : 'Top Student'}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
      {to ? (
        <Link to={to} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </motion.div>
  );
}

/** بطاقة أعلى 3 في آخر امتحان لم阶段 واحدة. */
export function LatestExamCard({
  entry,
  loading,
  error,
  accent,
  grade,
  highlightUserId,
}: {
  entry: LatestExamTop | undefined;
  loading: boolean;
  error: string;
  accent: 'sky' | 'ember';
  grade: 'bac1' | 'bac2';
  highlightUserId?: number;
}) {
  const { t, lang } = useLang();
  const badge =
    accent === 'sky'
      ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
      : 'bg-ember-500/15 text-ember-300 border-ember-500/40';
  const pill = accent === 'sky' ? 'text-sky-300' : 'text-ember-300';
  const examName = entry && (lang === 'ar' || !entry.examTitleEn) ? entry.examTitle : entry?.examTitleEn || entry?.examTitle;
  const gradeLabel = grade === 'bac1' ? t('auth.bac1') : t('auth.bac2');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl border border-dashed border-white/15 bg-ink-950/40 p-5 backdrop-blur-md sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge}`}>⚡ {t('top.subsidiaryBadge')}</span>
        <span className={`text-xs font-semibold ${pill}`}>{gradeLabel}</span>
        {entry && entry.examId != null && (
          <span className={`text-xs ${pill}`}>
            🎯 {t('top.latestExam')}: <span className="font-bold text-gray-200">{examName}</span>
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-ink-900/70 px-3 py-2.5">
              <div className="h-4 w-32 animate-pulse rounded bg-ink-700" />
              <div className="h-4 w-12 animate-pulse rounded bg-ink-700" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-fire-500/30 bg-fire-950/30 px-4 py-6 text-center text-sm text-fire-300">
          <span>⚠️ {t('top.latestError')}</span>
          {error && <span className="text-xs opacity-70">{error}</span>}
        </div>
      ) : entry && entry.examId != null ? (
        entry.top.length === 0 ? (
          <p className="rounded-xl border border-ink-600 bg-ink-900/70 px-4 py-6 text-center text-sm text-gray-400">
            {t('top.latestExamTopEmpty')}
          </p>
        ) : (
          <ol className="space-y-2">
            {entry.top.map((s, idx) => {
              const isMe = highlightUserId != null && s.userId === highlightUserId;
              return (
                <motion.li
                  key={s.userId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 ${
                    isMe ? 'bg-fire-500/20 ring-1 ring-fire-500/50' : 'bg-ink-900/70'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-lg">{MEDALS[idx + 1] ?? `#${idx + 1}`}</span>
                    <span className="truncate text-sm font-bold text-gray-200">
                      {s.fullName}
                      {isMe && <span className="ms-1 text-fire-300">{lang === 'ar' ? '(أنت)' : '(you)'}</span>}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-black ${badge}`}>{s.score}%</span>
                </motion.li>
              );
            })}
          </ol>
        )
      ) : (
        <p className="rounded-xl border border-ink-600 bg-ink-900/70 px-4 py-6 text-center text-sm text-gray-400">
          {t('top.noLatestExam')}
        </p>
      )}
    </motion.div>
  );
}
