import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 14 }}
        className="mb-4 text-8xl"
      >
        🔥
      </motion.div>
      <h1 className="text-4xl font-black">404</h1>
      <p className="mt-2 text-gray-400">{t('errors.generic')}</p>
      <Link to="/" className="btn-fire mt-6 rounded-xl px-6 py-3 font-bold text-white">
        {t('nav.home')}
      </Link>
    </div>
  );
}
