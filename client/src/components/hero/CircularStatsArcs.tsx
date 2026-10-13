import { motion, useReducedMotion } from 'motion/react';

interface CircularStatsArcsProps {
  stats: Array<{
    value: string;
    label: string;
    color: string;
  }>;
  className?: string;
}

export default function CircularStatsArcs({ stats, className = '' }: CircularStatsArcsProps) {
  const reducedMotion = useReducedMotion();

  const centerX = -110;
  const centerY = 300;
  const baseRadius = 180;
  const radiusStep = 55;
  const strokeWidth = 8;

  return (
    <div
      className={`hidden sm:block absolute left-0 top-1/2 -translate-y-1/2 w-[400px] h-[600px] pointer-events-none ${className}`}
      aria-hidden="true"
      style={{ zIndex: 50 }}
    >
      <svg
        viewBox="0 0 400 600"
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ transformOrigin: `${centerX + 400}px ${centerY}px` }}
      >
        {stats.map((stat, index) => {
          const radius = baseRadius + index * radiusStep;
          const circumference = 2 * Math.PI * radius;
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + Math.PI * 1.5;
          const pathLength = circumference * 0.75;

          const dotAngle = endAngle;
          const dotX = centerX + radius * Math.cos(dotAngle);
          const dotY = centerY + radius * Math.sin(dotAngle);

          const labelAngle = startAngle + (endAngle - startAngle) / 2;
          const labelRadius = radius + 35;
          const labelX = centerX + labelRadius * Math.cos(labelAngle);
          const labelY = centerY + labelRadius * Math.sin(labelAngle);

          return (
            <g key={index} color={stat.color}>
              <circle
                className="stats-arc stats-arc-bg"
                cx={centerX}
                cy={centerY}
                r={radius}
                strokeWidth={strokeWidth}
              />
              <motion.path
                className="stats-arc stats-arc-fg"
                d={`M ${centerX + radius * Math.cos(startAngle)} ${centerY + radius * Math.sin(startAngle)} A ${radius} ${radius} 0 0 1 ${centerX + radius * Math.cos(endAngle)} ${centerY + radius * Math.sin(endAngle)}`}
                strokeWidth={strokeWidth}
                style={{
                  pathLength: 1,
                  ['--path-length']: pathLength,
                } as React.CSSProperties}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: reducedMotion ? 0 : 1.6,
                  ease: [0.65, 0, 0.35, 1],
                  delay: reducedMotion ? 0 : index * 0.2,
                }}
              />
              <motion.circle
                className="stats-dot"
                cx={dotX}
                cy={dotY}
                r={strokeWidth / 2 + 2}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.4,
                  delay: reducedMotion ? 0 : 1.6 + index * 0.2,
                }}
              />
              <motion.circle
                className="stats-ring"
                cx={centerX}
                cy={centerY}
                r={radius + 12}
                strokeWidth={2}
                fill="none"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 0.2, 0.6] }}
                transition={{
                  duration: reducedMotion ? 0 : 3,
                  repeat: Infinity,
                  delay: reducedMotion ? 0 : 1.8 + index * 0.3,
                  ease: 'easeInOut',
                }}
              />
              <motion.text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-mono text-xs font-bold fill-white"
                style={{ filter: `drop-shadow(0 0 8px ${stat.color})` }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.5,
                  delay: reducedMotion ? 0 : 1.8 + index * 0.15,
                }}
              >
                {stat.value}
              </motion.text>
              <motion.text
                x={labelX}
                y={labelY + 18}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-sans text-[10px] font-medium fill-gray-400"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.5,
                  delay: reducedMotion ? 0 : 1.9 + index * 0.15,
                }}
              >
                {stat.label}
              </motion.text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}