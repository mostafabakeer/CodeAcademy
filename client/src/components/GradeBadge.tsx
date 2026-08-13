import { useLang } from '../i18n';

const styles: Record<string, string> = {
  all: 'bg-ink-600/40 text-gray-300 border-ink-500/40',
  bac1: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  bac2: 'bg-ember-500/15 text-ember-300 border-ember-500/40',
};

export default function GradeBadge({ grade }: { grade?: string }) {
  const { t } = useLang();
  const key = grade ?? 'all';
  const label = key === 'all' ? t('admin.gradeAll') : key === 'bac1' ? t('auth.bac1') : key === 'bac2' ? t('auth.bac2') : key;
  const cls = styles[key] ?? styles.all;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>;
}
