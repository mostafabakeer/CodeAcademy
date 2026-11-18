import { useLang } from '../i18n';
import { GRADE_KEYS, GRADE_LABEL_KEY } from '../lib/grades';

export const GRADE_OPTIONS = ['all', ...GRADE_KEYS] as const;
export type GradeOption = (typeof GRADE_OPTIONS)[number];

export default function GradeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLang();
  return (
    <select className="input-fire w-full rounded-xl px-4 py-2.5" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{t('admin.gradeAll')}</option>
      {GRADE_KEYS.map((g) => (
        <option key={g} value={g}>
          {t(GRADE_LABEL_KEY[g])}
        </option>
      ))}
    </select>
  );
}
