import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLang } from '../i18n';

export default function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useLang();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="card-fire max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-black">{title}</h2>
              <button onClick={onClose} className="btn-ghost-fire rounded-lg px-3 py-1.5 text-sm font-bold">
                {t('common.close')} ✕
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
