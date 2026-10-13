import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';

interface HeroTypographyCTAProps {
  eyebrow: string;
  titleLines: [string, string, string];
  description: string;
  ctaText: string;
  ctaHref: string;
  className?: string;
}

export default function HeroTypographyCTA({
  eyebrow,
  titleLines,
  description,
  ctaText,
  ctaHref,
  className = '',
}: HeroTypographyCTAProps) {
  const reducedMotion = useReducedMotion();

  const baseDelay = reducedMotion ? 0 : 0;
  const stagger = reducedMotion ? 0 : 0.12;

  return (
    <div
      className={`relative z-50 flex flex-col items-start gap-5 sm:gap-6 ${className}`}
      style={{ maxWidth: '720px' }}
    >
      <motion.span
        className="hero-rise text-fire-400 text-sm sm:text-base font-bold uppercase tracking-wider"
        style={{ animationDelay: `${baseDelay}s` }}
        initial={false}
      >
        {eyebrow}
      </motion.span>

      <motion.h1
        className="hero-rise text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] text-white"
        style={{ animationDelay: `${baseDelay + stagger}s` }}
        initial={false}
      >
        <span className="block">{titleLines[0]}</span>
        <span className="block text-fire-gradient">{titleLines[1]}</span>
        <span className="block">{titleLines[2]}</span>
      </motion.h1>

      <motion.p
        className="hero-rise text-base sm:text-lg leading-relaxed text-gray-400 max-w-xl"
        style={{ animationDelay: `${baseDelay + stagger * 2}s` }}
        initial={false}
      >
        {description}
      </motion.p>

      <motion.div
        className="hero-rise flex flex-wrap gap-3 mt-2"
        style={{ animationDelay: `${baseDelay + stagger * 3}s` }}
        initial={false}
      >
        <Link
          to={ctaHref}
          className="cta-magnetic group btn-fire rounded-xl px-8 py-4 text-base font-bold text-white shadow-xl shadow-fire-900/40 transition-transform hover:scale-[1.04] active:scale-95"
        >
          <span className="relative z-10">{ctaText}</span>
        </Link>
      </motion.div>
    </div>
  );
}