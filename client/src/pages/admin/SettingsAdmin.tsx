import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';

interface Tier {
  min: number;
  key: string;
  name: string;
  nameEn: string;
}

export default function SettingsAdmin() {
  const { t } = useLang();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ config: { levels: { tiers: Tier[] } } }>('/api/admin/config')
      .then((d) => setTiers(d.config.levels.tiers))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setError('');
    try {
      await api('/api/admin/config/levels', { method: 'PUT', body: JSON.stringify({ tiers }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const update = (i: number, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((t, ti) => (ti === i ? { ...t, ...patch } : t)));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">⚙️ {t('admin.settings')}</h1>
          <p className="text-sm text-gray-400">{t('admin.levelsConfig')}</p>
        </div>
        <button onClick={save} className="btn-fire rounded-xl px-5 py-2.5 font-bold text-white">
          {saved ? `✓ ${t('admin.synced')}` : t('admin.saveLevels')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : (
        <div className="card-fire rounded-2xl p-5">
          <div className="grid grid-cols-1 gap-3 border-b border-ink-600 pb-3 text-xs font-bold text-gray-400 md:grid-cols-[100px_1fr_1fr]">
            <span>{t('admin.minPoints')}</span>
            <span>{t('admin.levelName')}</span>
            <span>{t('admin.levelNameEn')}</span>
          </div>
          <div className="mt-3 space-y-3">
            {tiers.map((tier, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="grid grid-cols-1 gap-3 md:grid-cols-[100px_1fr_1fr]">
                <input type="number" min={0} max={100} className="input-fire rounded-xl px-3 py-2 text-sm" value={tier.min} onChange={(e) => update(i, { min: Number(e.target.value) })} />
                <input className="input-fire rounded-xl px-3 py-2 text-sm" value={tier.name} onChange={(e) => update(i, { name: e.target.value })} />
                <input className="input-fire rounded-xl px-3 py-2 text-sm" dir="ltr" value={tier.nameEn} onChange={(e) => update(i, { nameEn: e.target.value })} />
              </motion.div>
            ))}
          </div>
          <p className="mt-5 rounded-xl bg-ink-900 p-4 text-xs leading-relaxed text-gray-400">
            💡 {t('profile.levelHint')} — {t('admin.levelFormula')}
          </p>
        </div>
      )}
    </div>
  );
}
