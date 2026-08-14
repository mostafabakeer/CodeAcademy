import { motion } from 'motion/react';
import { useLang } from '../i18n';

const levelColors: Record<string, string> = {
  beginner: 'from-emerald-500/30 to-teal-500/20 text-emerald-300 border-emerald-500/40',
  intermediate: 'from-sky-500/30 to-blue-500/20 text-sky-300 border-sky-500/40',
  advanced: 'from-fire-500/30 to-ember-500/20 text-fire-300 border-fire-500/40',
  expert: 'from-amber-400/30 to-fire-500/20 text-amber-300 border-amber-400/50',
};

export default function LevelBadge({ levelKey, name, nameEn, size = 'md' }: { levelKey?: string; name?: string; nameEn?: string; size?: 'sm' | 'md' | 'lg' }) {
  const { lang } = useLang();
  const label = lang === 'ar' ? name : nameEn;
  const cls = levelColors[levelKey ?? ''] ?? levelColors.beginner;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : size === 'lg' ? 'px-4 py-1.5 text-base' : 'px-3 py-1 text-sm';

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`inline-flex items-center gap-1 rounded-full border bg-gradient-to-r font-bold ${cls} ${padding}`}
    >
      <span className="text-current">{levelKey === 'expert' ? '🔥' : '⚡'}</span>
      {label}
    </motion.span>
  );
}
