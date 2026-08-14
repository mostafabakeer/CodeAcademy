import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

const RANK_LABEL: Record<string, { ar: string; en: string }> = {
  '1': { ar: 'الأول', en: '1st' },
  '2': { ar: 'الثاني', en: '2nd' },
  '3': { ar: 'الثالث', en: '3rd' },
};

export default function TopStudentCertificate() {
  const { t, lang } = useLang();
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<TopStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ students: TopStudent[] }>('/api/top-students')
      .then((d) => {
        const found = d.students.find((s) => s.id === Number(id));
        if (!found) setError(t('top.empty'));
        else setStudent(found);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, t]);

  const share = async () => {
    const url = window.location.href;
    const text = `${t('top.certificate')} — ${student?.name} 🏆 ${t('top.title')}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t('top.certificate'), text, url });
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

  const rankLabel =
    student && RANK_LABEL[String(student.rank)]
      ? RANK_LABEL[String(student.rank)][lang === 'ar' ? 'ar' : 'en']
      : `#${student?.rank}`;

  return (
    <div className="relative mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center py-10">
      <Sparkles behind />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3 print:hidden">
          <button onClick={() => window.print()} className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">
            🖨 {t('top.print')}
          </button>
          <button onClick={share} className="btn-ghost-fire rounded-xl px-5 py-2.5 text-sm font-bold">
            {copied ? `✅ ${t('top.shareCopied')}` : `🔗 ${t('top.share')}`}
          </button>
          <Link to="/top-students" className="btn-ghost-fire rounded-xl px-5 py-2.5 text-sm font-bold">
            ← {t('nav.topStudents')}
          </Link>
        </div>

        {error && <div className="mb-4 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300 print:hidden">{error}</div>}

        {loading ? (
          <p className="text-center text-gray-400 print:hidden">{t('common.loading')}</p>
        ) : !student ? (
          <div className="card-fire rounded-3xl p-10 text-center text-gray-400 print:hidden">{t('top.empty')}</div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }} className="w-full">
            <div className="certificate relative overflow-hidden rounded-3xl">
              <div className="pointer-events-none absolute inset-0 spark-field" aria-hidden="true" />
              <span className="corner-orn tl" aria-hidden="true" />
              <span className="corner-orn tr" aria-hidden="true" />
              <span className="corner-orn bl" aria-hidden="true" />
              <span className="corner-orn br" aria-hidden="true" />
              <img
                src="/logo.png"
                alt=""
                className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 opacity-[0.05]"
              />

              <div className="relative p-8 sm:p-12 md:p-14">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-fire-500/15 to-amber-400/20 ring-1 ring-amber-400/40 sm:h-20 sm:w-20">
                      <img src="/logo.png" alt="DR Code" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
                    </div>
                    <div>
                      <div className="text-xl font-black tracking-tight text-ink-950 sm:text-2xl">{t('top.academy')}</div>
                      <div className="text-[11px] font-medium text-gray-500 sm:text-xs">{t('top.academySub')}</div>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t('top.certificateNo')}</div>
                    <div className="mt-1 rounded-lg bg-ink-950/5 px-2.5 py-1 font-black tracking-[0.15em] text-fire-600" dir="ltr">
                      DC-{String(student.id).padStart(4, '0')}
                    </div>
                  </div>
                </div>

                <div className="my-6 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />

                <div className="text-center">
                  <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-400/70" />
                    <div className="absolute inset-2 rounded-full border border-amber-400/60 bg-gradient-to-b from-amber-100 via-amber-200 to-amber-300 shadow-inner" />
                    <span className="relative text-4xl drop-shadow sm:text-5xl">
                      {student.rank <= 3 ? (student.rank === 1 ? '🥇' : student.rank === 2 ? '🥈' : '🥉') : '🏅'}
                    </span>
                  </div>

                  <div className="mb-3 flex items-center justify-center gap-3">
                    <span className="h-px max-w-28 flex-1 bg-gradient-to-r from-transparent to-amber-500/70" />
                    <span className="text-lg text-amber-500">✦</span>
                    <span className="h-px max-w-28 flex-1 bg-gradient-to-l from-transparent to-amber-500/70" />
                  </div>
                  <h1 className="text-3xl font-black tracking-tight sm:text-[2.75rem]">
                    <span className="text-fire-gradient">{t('top.certificate')}</span>
                  </h1>

                  <p className="mt-7 text-base leading-relaxed text-gray-600 sm:text-lg">{t('top.thisIsToCertify')}</p>
                  <p className="mx-auto mt-3 inline-block break-words border-b-[3px] border-amber-500/70 px-5 pb-2.5 text-2xl font-black tracking-wide text-ink-950 sm:text-[2.6rem]">
                    {student.name}
                  </p>
                  <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-gray-600 sm:text-lg">
                    {t('top.hasAchieved')} <span className="font-black text-fire-600">{rankLabel}</span> {t('top.inGrade')}{' '}
                    <span className="font-black text-fire-600">{student.gradeName}</span>
                  </p>

                  <p className="mx-auto mt-7 max-w-md text-sm italic leading-relaxed text-gray-500">{t('top.certificateMsg')}</p>

                  <div className="mx-auto mt-12 flex items-end justify-between gap-6">
                    <div className="text-center">
                      <div className="w-40 border-t-2 border-gray-400 pt-2.5 text-base font-black text-gray-700 sm:w-44">
                        {lang === 'ar' ? 'مصطفى بكير' : 'Mostafa Bakir'}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{t('top.founderTitle')}</div>
                    </div>
                    <div className="seal hidden sm:flex" aria-hidden="true">
                      <img src="/logo.png" alt="" />
                      <span>DR CODE</span>
                    </div>
                    <div className="text-center">
                      <div className="pt-2.5 text-base font-black text-gray-700" dir="ltr">
                        {new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{t('top.date')}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
