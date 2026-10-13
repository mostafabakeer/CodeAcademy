import { motion, useReducedMotion } from 'motion/react';
import ParallaxGridBackground from './ParallaxGridBackground';
import KenBurnsSpotlight from './KenBurnsSpotlight';
import CircularStatsArcs from './CircularStatsArcs';
import HeroTypographyCTA from './HeroTypographyCTA';
import Sparkles from '../Sparkles';

interface HeroSectionProps {
  baseImage: string;
  highlightImage?: string;
  alt: string;
  eyebrow: string;
  titleLines: [string, string, string];
  description: string;
  ctaText: string;
  ctaHref: string;
  stats: Array<{
    value: string;
    label: string;
    color: string;
  }>;
  className?: string;
}

export default function HeroSection({
  baseImage,
  highlightImage,
  alt,
  eyebrow,
  titleLines,
  description,
  ctaText,
  ctaHref,
  stats,
  className = '',
}: HeroSectionProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.section
      className={`relative overflow-hidden rounded-3xl border border-fire-900/30 bg-gradient-to-br from-ink-900 via-ink-950 to-ink-900 px-6 py-12 sm:px-10 lg:px-14 lg:py-16 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.55, ease: 'easeOut' }}
      aria-labelledby="hero-title"
    >
      {/* Layer 1: Parallax Grid Background (z-0) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <ParallaxGridBackground />
        <Sparkles behind />
      </div>

      {/* Background glow blobs */}
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-fire-600/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ember-500/15 blur-3xl" />

      {/* Layer 3: Circular Stats Arcs (z-50, desktop only) */}
      <CircularStatsArcs stats={stats} />

      {/* Main content grid */}
      <div className="relative z-10 grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Layer 4: Hero Typography & CTA (z-50) */}
        <HeroTypographyCTA
          eyebrow={eyebrow}
          titleLines={titleLines}
          description={description}
          ctaText={ctaText}
          ctaHref={ctaHref}
        />

        {/* Layer 2: Ken Burns + Spotlight (z-10, z-30) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.6, ease: 'easeOut', delay: reducedMotion ? 0 : 0.1 }}
          className="relative"
        >
          <KenBurnsSpotlight
            baseImage={baseImage}
            highlightImage={highlightImage}
            alt={alt}
            className="relative overflow-hidden rounded-3xl border border-fire-500/25 bg-ink-900 shadow-2xl shadow-fire-950/60"
          />
        </motion.div>
      </div>
    </motion.section>
  );
}