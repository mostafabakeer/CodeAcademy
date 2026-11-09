import { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api/client';
import { useLang } from '../i18n';
import { useUser } from '../store/authStore';
import { useBootstrapData } from '../lib/useBootstrapData';
import { StaleNotice, LoadError } from '../components/PageStatus';
import { downloadWatermarkedPDF } from '../lib/pdfWatermark';

const Markdown = lazy(() => import('react-markdown'));

export default function Notes() {
  const { t, lang } = useLang();
  const user = useUser();
  const { data, error, retry } = useBootstrapData(user?.id);
  const allNotes = data?.notes ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const pdfRequest = useRef<AbortController | null>(null);
  const loading = !data && !error;

  const studentName = user?.fullName || '';
  const studentPhone = user?.phone || '';
  const studentGrade = user?.grade || '';

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

  const downloadNotePdf = async (noteId: number, noteTitle: string) => {
    pdfRequest.current?.abort();
    const request = new AbortController();
    pdfRequest.current = request;
    setDownloadingId(noteId);
    setPdfError(null);

    try {
      const result = await api<{ url: string }>(`/api/notes/${noteId}/pdf`, { signal: request.signal });
      if (!request.signal.aborted && result.url) {
        const fileName = noteTitle.replace(/[^a-zA-Z0-9؀-ۿ\s-]+/g, '').trim() + '.pdf';
        await downloadWatermarkedPDF(result.url, fileName, {
          studentName,
          studentPhone,
          grade: studentGrade,
        });
      }
    } catch {
      if (!request.signal.aborted) setPdfError(t('note.pdfError'));
    } finally {
      if (pdfRequest.current === request) {
        pdfRequest.current = null;
        setDownloadingId(null);
      }
    }
  };

  const handleToggle = (noteId: number) => {
    pdfRequest.current?.abort();
    pdfRequest.current = null;
    setOpen((prev) => (prev === noteId ? null : noteId));
    setPdfError(null);
  };

  const renderNote = (n: (typeof filteredNotes)[number], index: number) => {
    const isOpen = open === n.id;
    const isDownloading = downloadingId === n.id;
    const title = lang === 'ar' ? n.title : n.titleEn;

    return (
      <motion.div
        key={n.id}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index, 10) * 0.03}}
        className="card-fire rounded-2xl overflow-hidden"
      >
        <button
          onClick={() => handleToggle(n.id)}
          className="flex w-full items-center justify-between gap-3 p-5 text-start"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <span className="font-extrabold">{title}</span>
          </div>
          <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="text-fire-400">▾</motion.span>
        </button>
        <AnimatePresence initial={false}>
          {isOpen ? (
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
                    {!isDownloading && !pdfError && (
                      <button
                        type="button"
                        onClick={() => void downloadNotePdf(n.id, title)}
                        disabled={isDownloading}
                        className="btn-fire w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60 touch-target"
                      >
                        ⬇️ {t('note.downloadPdf')}
                      </button>
                    )}
                    {isDownloading && (
                      <div className="mt-3 flex flex-col items-center gap-2 py-8 rounded-xl bg-ink-900/50">
                        <div className="relative h-16 w-16">
                          <div className="absolute inset-0 rounded-full border-4 border-fire-500/20" />
                          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-fire-500" />
                          <div className="absolute inset-2 animate-pulse rounded-full bg-fire-500/20" />
                        </div>
                        <p className="text-sm font-medium text-gray-300">{t('note.pdfLoading')}</p>
                        <p className="text-xs text-gray-500">{t('note.preparingWatermark')}</p>
                      </div>
                    )}
                    {pdfError && (
                      <div className="mt-3 rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3">
                        <p role="alert" className="text-sm text-fire-300">⚠️ {pdfError}</p>
                        <button
                          onClick={() => void downloadNotePdf(n.id, title)}
                          className="mt-2 btn-fire w-full rounded-lg px-4 py-2 text-sm font-bold text-white"
                        >
                          {t('note.retry')}
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </motion.div>
          ) : null}
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

          {/* Notes list with pull-to-refresh */}
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