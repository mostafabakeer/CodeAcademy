import type { ReactNode } from 'react';
import { motion } from 'motion/react';

export default function StatCard({ icon, label, value, delay = 0 }: { icon: ReactNode; label: string; value: string | number; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      className="card-fire card-fire-hover flex items-center gap-4 rounded-2xl p-4"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fire-600 to-ember-500 text-xl text-white shadow-lg shadow-fire-900/40">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-gray-400">{label}</div>
        <div className="text-2xl font-extrabold text-fire-gradient">{value}</div>
      </div>
    </motion.div>
  );
}
