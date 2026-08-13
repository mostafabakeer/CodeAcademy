import { motion } from 'motion/react';

export default function ProgressBar({ value, className = '', showLabel = true }: { value: number; className?: string; showLabel?: boolean }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className={`w-full ${className}`}>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink-700">
        <motion.div
          className="bar-fire h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${v}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="animate-shine h-full w-full bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%]" />
        </div>
      </div>
      {showLabel && (
        <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
          <span>{v}%</span>
        </div>
      )}
    </div>
  );
}
