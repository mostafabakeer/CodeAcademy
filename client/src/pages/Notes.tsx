import { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api/client';
import { useLang } from '../i18n';
import { useUser } from '../store/authStore';
import { useBootstrapData } from '../lib/useBootstrapData';
import { StaleNotice, LoadError } from '../components/PageStatus';

const Markdown = lazy(() => import('react-markdown'));

export default function Notes() {
  const { t, lang } = useLang();
  const user = useUser();
  const { data, error, retry } = useBootstrapData(user?.id);
  const allNotes = data?.notes ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const pdfRequest = useRef<AbortController | null>(null);
  const loading = !data && !error;

  // Filter notes client-side with search
  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allNotes;
    return allNotes.filter((n) =>
      (lang === 'ar' ? n.title : n.titleEn || n.title).toLowerCase().includes(q) ||
      (lang === 'ar' ? n.body : n.bodyEn || n.body).toLowerCase().includes(q)
    );
  }, [allNotes, searchQuery, lang]);

  useEffect(() => () => pdfRequest.current?.abort(), []);

  // Pull-to-refresh on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStart;
    // Only trigger if at top of page and pulled down > 80px
    if (diff > 80 && window.scrollY === 0) {
      retry();
      setTouchStart(null);
    }
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
  };

  const viewPdf = async (noteId: number) => {
    pdfRequest.current?.abort();
    const request = new AbortController();
    pdfRequest.current = request;
    setPdfLoading(true);
    setPdfError(null);
    setPdfUrl(null);
    try {
      const result = await api<{ url: string }>(`/api/notes/${noteId}/pdf`, { signal: request.signal });
      if (!request.signal.aborted) setPdfUrl(result.url);
    } catch {
      if (!request.signal.aborted) setPdfError(t('note.pdfError'));
    } finally {
      if (pdfRequest.current === request) {
        pdfRequest.current = null;
        setPdfLoading(false);
      }
    }
  };

  const handleToggle = (noteId: number) => {
    pdfRequest.current?.abort();
    pdfRequest.current = null;
    setPdfLoading(false);
    setOpen((prev) => (prev === noteId ? null : noteId));
    setPdfUrl(null);
    setPdfError(null);
  };

  const renderNote = (n: (typeof filteredNotes)[number], index: number) => {
    const isOpen = open === n.id;
    return (
      <motion.div
        key={n.id}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index, 10) * 0.03 }}
        className="card-fire rounded-2xl overflow-hidden"
      >
        <button
          onClick={() => handleToggle(n.id)}
          className="flex w-full items-center justify-between gap-3 p-5 text-start"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <span className="font-extrabold">{lang === 'ar' ? n.title : n.titleEn}</span>
          </div>
          <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="text-fire-400">▾</motion.span>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="px-5 pb-5">
                {n.image && (
                  <img
                    src={n.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="mb-3 max-h-60 w-full rounded-xl object-cover"
                  />
                )}
                <div className="markdown-body text-sm">
                  <Suspense fallback={<p className="text-gray-400">{t('common.loading')}</p>}>
                    <Markdown>{lang === 'ar' ? n.body : n.bodyEn}</Markdown>
                  </Suspense>
                </div>
                {n.pdf && (
                  <section className="mt-5 border-t border-ink-600 pt-4">
                    {!pdfUrl && (
                      <button
                        type="button"
                        onClick={() => void viewPdf(n.id)}
                        disabled={pdfLoading}
                        className="btn-fire rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {pdfLoading ? t('note.pdfLoading') : `📖 ${t('note.viewPdf')}`}
                      </button>
                    )}
                    {pdfError && <p role="alert" className="mt-3 text-sm text-fire-300">{pdfError}</p>}
                    {pdfUrl && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-ink-600 bg-ink-950">
                        <iframe
                          title={`${lang === 'ar' ? n.title : n.titleEn} — ${t('note.viewPdf')}`}
                          src={`${pdfUrl}#toolbar=0&navpanes=0`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-[65vh] min-h-80 w-full"
                        />
                      </div>
                    )}
                  </section>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black sm:text-3xl">📖 {t('note.title')}</h1>
        <p className="mt-1 text-gray-400">{t('home.subtitle')}</p>
      </motion.div>

      {error && data && <StaleNotice message={error} onRetry={retry} />}

      {error && !data ? (
        <LoadError message={error} onRetry={retry} />
      ) : loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : filteredNotes.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">
          {searchQuery ? t('note.noSearchResults') : t('note.noNotes')}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('note.searchPlaceholder')}
              className="input-fire w-full rounded-xl py-2.5 pe-10 ps-10 text-sm"
            />
          </div>

          {/* Notes list with pull-to-refresh (البحث والفتح يقلّلان العمل: جسم المذكرة لا يُصيَّر إلا عند الفتح) */}
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="space-y-4"
          >
            {filteredNotes.map((note, index) => renderNote(note, index))}
          </div>
        </div>
      )}
    </div>
  );
}
