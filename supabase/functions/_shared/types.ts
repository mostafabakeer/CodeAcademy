/** أنواع النطاق المشترك بين كل الـ Edge Functions والعميل. */

export type Role = 'student' | 'admin';
export type ContentGrade = 'bac1' | 'bac2' | 'all';

export interface LevelTier {
  min: number;
  key: string;
  name: string;
  nameEn: string;
}

export interface StudentStats {
  examAvg: number;
  watchRatio: number;
  points: number;
  level: LevelTier;
  completedLessons: number;
  totalLessons: number;
  examsTaken: number;
  totalExams: number;
}
