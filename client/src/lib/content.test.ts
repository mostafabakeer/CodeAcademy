/* =================== Unit Tests for Exam Sorting =================== */

import { describe, expect, it } from 'vitest';

// Mock exam data
interface Exam {
  id: number;
  title: string;
  titleEn: string;
  createdAt: number;
  order?: number;
  isHidden?: boolean;
}

describe('Exam Sorting', () => {
  const createExams = (): Exam[] => [
    { id: 1, title: 'Exam 1', titleEn: 'Exam 1', createdAt: 1000, order: 1 },
    { id: 2, title: 'Exam 2', titleEn: 'Exam 2', createdAt: 3000, order: 2 },
    { id: 3, title: 'Exam 3', titleEn: 'Exam 3', createdAt: 2000, order: 3 },
  ];

  it('should sort exams by createdAt descending (newest first)', () => {
    const exams = createExams();

    // Sort by createdAt descending
    const sorted = [...exams].sort((a, b) => b.createdAt - a.createdAt);

    expect(sorted[0].id).toBe(2); // createdAt: 3000 (newest)
    expect(sorted[1].id).toBe(3); // createdAt: 2000
    expect(sorted[2].id).toBe(1); // createdAt: 1000 (oldest)
  });

  it('should use id as tiebreaker when createdAt is equal', () => {
    const exams: Exam[] = [
      { id: 1, title: 'Exam 1', titleEn: 'Exam 1', createdAt: 1000 },
      { id: 2, title: 'Exam 2', titleEn: 'Exam 2', createdAt: 1000 },
      { id: 3, title: 'Exam 3', titleEn: 'Exam 3', createdAt: 1000 },
    ];

    const sorted = [...exams].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);

    expect(sorted[0].id).toBe(3);
    expect(sorted[1].id).toBe(2);
    expect(sorted[2].id).toBe(1);
  });

  it('should filter hidden exams for students', () => {
    const exams: Exam[] = [
      { id: 1, title: 'Visible Exam', titleEn: 'Visible Exam', createdAt: 3000, isHidden: false },
      { id: 2, title: 'Hidden Exam', titleEn: 'Hidden Exam', createdAt: 2000, isHidden: true },
      { id: 3, title: 'Another Visible', titleEn: 'Another Visible', createdAt: 1000, isHidden: false },
    ];

    const visible = exams.filter(e => !e.isHidden);

    expect(visible).toHaveLength(2);
    expect(visible[0].id).toBe(1);
    expect(visible[1].id).toBe(3);
  });

  it('should display new badge for exams created within 7 days', () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const exams: Exam[] = [
      { id: 1, title: 'New Exam', titleEn: 'New Exam', createdAt: now - 3 * 24 * 60 * 60 * 1000 }, // 3 days ago
      { id: 2, title: 'Old Exam', titleEn: 'Old Exam', createdAt: now - 10 * 24 * 60 * 60 * 1000 }, // 10 days ago
    ];

    const isNew = (exam: Exam) => exam.createdAt > sevenDaysAgo;

    expect(isNew(exams[0])).toBe(true);
    expect(isNew(exams[1])).toBe(false);
  });

  it('should format upload date correctly for Arabic locale', () => {
    const date = new Date('2026-10-12T00:00:00Z');
    const formatted = date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Should contain Arabic month name (October in Arabic) and numbers
    // Note: locale output uses Arabic numerals (١٢ أكتوبر ٢٠٢٦)
    expect(formatted).toContain('أكتوبر');
    expect(formatted).toMatch(/[0-9٠-٩]{4}/); // Year in Arabic or Western numerals
    expect(formatted).toMatch(/[0-9٠-٩]{1,2}/); // Day in Arabic or Western numerals
  });
});