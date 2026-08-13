import type { LevelTier } from './types.ts';

export const DEFAULT_LEVELS: LevelTier[] = [
  { min: 0, key: 'beginner', name: 'مبتدئ', nameEn: 'Beginner' },
  { min: 25, key: 'intermediate', name: 'متوسط', nameEn: 'Intermediate' },
  { min: 50, key: 'advanced', name: 'متقدم', nameEn: 'Advanced' },
  { min: 75, key: 'expert', name: 'محترف', nameEn: 'Expert' },
];

export function tierByPoints(points: number, tiers: LevelTier[]): LevelTier {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  return sorted.find((t) => points >= t.min) ?? sorted[sorted.length - 1] ?? DEFAULT_LEVELS[0];
}
