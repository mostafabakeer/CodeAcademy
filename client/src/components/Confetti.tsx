import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const COLORS = ['#e11d31', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a855f7', '#fb7185'];

interface Piece {
  left: number;
  drift: number;
  delay: number;
  duration: number;
  size: number;
  rotate: number;
  color: string;
  round: boolean;
}

/**
 * احتفال قصير عند النجاح — قطع ملوّنة تتساقط من أعلى الشاشة، بلا صور أو
 * مكتبات إضافية (motion موجودة أصلاً). يُحترم `prefers-reduced-motion`:
 * لا حركة إطلاقاً لمن طلب تقليلها.
 */
export default function Confetti({ show, count = 46 }: { show: boolean; count?: number }) {
  const reduced = useReducedMotion();

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        drift: (Math.random() - 0.5) * 180,
        delay: Math.random() * 0.45,
        duration: 2 + Math.random() * 1.4,
        size: 6 + Math.random() * 7,
        rotate: 180 + Math.random() * 540,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      })),
    [count]
  );

  if (!show || reduced) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 1.8),
            backgroundColor: p.color,
            borderRadius: p.round ? '9999px' : '2px',
          }}
          initial={{ y: '-10vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '108vh', x: p.drift, rotate: p.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
