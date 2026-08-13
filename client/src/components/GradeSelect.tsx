import { useLang } from '../i18n';

export const GRADE_OPTIONS = ['all', 'bac1', 'bac2'] as const;
export type GradeOption = (typeof GRADE_OPTIONS)[number];

export default function GradeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLang();
  return (
    <select className="input-fire w-full rounded-xl px-4 py-2.5" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{t('admin.gradeAll')}</option>
      <option value="bac1">{t('auth.bac1')}</option>
      <option value="bac2">{t('auth.bac2')}</option>
    </select>
  );
}
