import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { useReducedMotion } from 'motion/react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  highlights: string[];
  index: number;
  className?: string;
}

export default function FeatureCard({
  icon: Icon,
  title,
  description,
  highlights,
  index,
  className = '',
}: FeatureCardProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={`card-fire card-fire-hover group relative rounded-3xl p-6 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{
        duration: reducedMotion ? 0 : 0.45,
        ease: 'easeOut',
        delay: reducedMotion ? 0 : index * 0.08,
      }}
    >
      {/* Icon with glowing ring */}
      <div className="mb-5 relative">
        <div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-fire-500/20 to-ember-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
          aria-hidden="true"
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-fire-600/30 to-ember-500/30 ring-2 ring-fire-500/30 group-hover:ring-fire-400 group-hover:ring-2 transition-all duration-500">
          <Icon className="h-8 w-8 text-fire-300 group-hover:text-fire-200 transition-colors duration-300" aria-hidden="true" />
        </div>
      </div>

      {/* Title & Description */}
      <h3 className="text-lg font-extrabold text-white mb-2">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-400 mb-5">{description}</p>

      {/* Highlights list */}
      <ul className="space-y-2.5" role="list" aria-label="مميزات">
        {highlights.map((highlight, i) => (
          <motion.li
            key={i}
            className="flex items-start gap-3 text-sm text-gray-300 group-hover:text-gray-100 transition-colors"
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: reducedMotion ? 0 : 0.3,
              delay: reducedMotion ? 0 : 0.2 + i * 0.06,
            }}
          >
            <span className="flex-shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-fire-500/20 text-fire-400">
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
            <span>{highlight}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}