import { useLang } from '../i18n';
import { gradeLabelKey } from '../lib/grades';

const styles: Record<string, string> = {
  all: 'bg-ink-600/40 text-gray-300 border-ink-500/40',
  bac1: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  bac2: 'bg-ember-500/15 text-ember-300 border-ember-500/40',
  cs: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
};

export default function GradeBadge({ grade }: { grade?: string }) {
  const { t } = useLang();
  const key = grade ?? 'all';
  const cls = styles[key] ?? styles.all;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {t(gradeLabelKey(key))}
    </span>
  );
}
