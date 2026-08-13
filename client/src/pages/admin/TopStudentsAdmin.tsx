import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import { uploadFile } from '../../api/upload';
import Modal from '../../components/Modal';
import GradeBadge from '../../components/GradeBadge';

interface TopStudent {
  id: number;
  name: string;
  image: string;
  rank: number;
  grade: string;
}

const empty = { name: '', image: '', rank: 1, grade: 'bac1' };

export default function TopStudentsAdmin() {
  const { t } = useLang();
  const [students, setStudents] = useState<TopStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TopStudent | null>(null);
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    api<{ students: TopStudent[] }>('/api/admin/top-students')
      .then((d) => setStudents(d.students))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setError('');
    setOpen(true);
  };

  const openEdit = (s: TopStudent) => {
    setEditing(s);
    setForm({ name: s.name, image: s.image || '', rank: s.rank || 1, grade: s.grade });
    setError('');
    setOpen(true);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile('images', file);
      setForm((f) => ({ ...f, image: url }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError(t('errors.required'));
    try {
      const body = { ...form, rank: Number(form.rank) || 1 };
      if (editing) await api(`/api/admin/top-students/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/admin/top-students', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t('common.delete') + '?')) return;
    await api(`/api/admin/top-students/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">🏆 {t('admin.topStudents')}</h1>
        <button onClick={openNew} className="btn-fire rounded-xl px-4 py-2 text-sm font-bold text-white">
          + {t('admin.addTopStudent')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : students.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.topEmpty')}</p>
      ) : (
        <div className="card-fire overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink-600 text-start text-gray-400">
                <th className="px-4 py-3 text-start">{t('admin.topName')}</th>
                <th className="px-4 py-3 text-start">{t('admin.topRank')}</th>
                <th className="px-4 py-3 text-start">{t('admin.topGrade')}</th>
                <th className="px-4 py-3 text-end">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="border-b border-ink-800 hover:bg-ink-850">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-ink-800 ring-2 ring-fire-500/30">
                        {s.image ? (
                          <img src={s.image} alt={s.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-500">🎓</div>
                        )}
                      </div>
                      <span className="font-bold">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-fire-500/15 px-2.5 py-0.5 font-black text-fire-300">#{s.rank}</span>
                  </td>
                  <td className="px-4 py-3">
                    <GradeBadge grade={s.grade} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => openEdit(s)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold">
                        {t('common.edit')}
                      </button>
                      <button onClick={() => remove(s.id)} className="rounded-lg border border-fire-500/40 px-3 py-1 text-xs font-bold text-fire-300">
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('admin.editTopStudent') : t('admin.addTopStudent')}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.topGrade')} *</label>
            <select className="input-fire w-full rounded-xl px-4 py-2.5" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
              <option value="bac1">{t('auth.bac1')}</option>
              <option value="bac2">{t('auth.bac2')}</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.topName')} *</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.topRank')} *</label>
              <input type="number" min={1} className="input-fire w-full rounded-xl px-4 py-2.5" value={form.rank} onChange={(e) => setForm({ ...form, rank: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.topImage')} — {t('admin.uploadImage')}</label>
            <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} className="input-fire w-full rounded-xl px-4 py-2.5 text-sm" />
            {uploading && <p className="mt-1 text-xs text-ember-400">{t('admin.uploading')}...</p>}
            {form.image && (
              <div className="mt-2 flex items-center gap-3">
                <img src={form.image} alt="preview" className="h-16 w-16 rounded-xl object-cover ring-2 ring-fire-500/40" />
                <span className="text-xs text-emerald-400">✓ {t('admin.uploaded')}</span>
              </div>
            )}
          </div>
          {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-2 text-sm text-fire-300">{error}</div>}
          <button type="submit" className="btn-fire w-full rounded-xl px-4 py-2.5 font-bold text-white">
            {t('common.save')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
