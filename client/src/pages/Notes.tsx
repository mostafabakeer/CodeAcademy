import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLang } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import { loadBootstrap, type Note } from '../lib/content';

const Markdown = lazy(() => import('react-markdown'));

export default function Notes() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    loadBootstrap(userId)
      .then((b) => setNotes(b.notes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black sm:text-3xl">📖 {t('note.title')}</h1>
        <p className="mt-1 text-gray-400">{t('home.subtitle')}</p>
      </motion.div>

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : notes.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('note.noNotes')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((n, i) => {
            const isOpen = open === n.id;
            return (
              <motion.div key={n.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card-fire rounded-2xl overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : n.id)} className="flex w-full items-center justify-between gap-3 p-5 text-start">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📄</span>
                    <span className="font-extrabold">{lang === 'ar' ? n.title : n.titleEn}</span>
                  </div>
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="text-fire-400">▾</motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div className="px-5 pb-5">
                        {n.image && <img src={n.image} alt="" loading="lazy" decoding="async" className="mb-3 max-h-60 w-full rounded-xl object-cover" />}
                        <div className="markdown-body text-sm">
                          <Suspense fallback={<p className="text-gray-400">{t('common.loading')}</p>}>
                            <Markdown>{lang === 'ar' ? n.body : n.bodyEn}</Markdown>
                          </Suspense>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
