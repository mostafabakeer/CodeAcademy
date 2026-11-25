import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import AdminPageHeader from './AdminPageHeader';
import { api } from '../../api/client';
import { uploadFile } from '../../api/upload';
import Modal from '../../components/Modal';
import GradeBadge from '../../components/GradeBadge';
import AsyncButton from '../../components/AsyncButton';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useAction } from '../../store/actionStore';
import { GRADE_KEYS, GRADE_LABEL_KEY } from '../../lib/grades';

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
  const run = useAction();
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
      await run(
        { key: 'topstudent:image', label: t('action.upload'), kind: 'upload' },
        async () => {
          const url = await uploadFile('images', file);
          setForm((f) => ({ ...f, image: url }));
        },
      );
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
      await run(
        {
          key: editing ? `topstudent:edit:${editing.id}` : 'topstudent:new',
          label: t('action.save'),
          kind: 'save',
          successMessage: t('common.success'),
        },
        async () => {
          const body = { ...form, rank: Number(form.rank) || 1 };
          if (editing) {
            const d = await api<{ student: TopStudent }>(`/api/admin/top-students/${editing.id}`, {
              method: 'PUT',
              body: JSON.stringify(body),
            });
            setStudents((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...d.student } : s)));
          } else {
            const d = await api<{ student: TopStudent }>('/api/admin/top-students', {
              method: 'POST',
              body: JSON.stringify(body),
            });
            setStudents((prev) => [d.student, ...prev]);
          }
          setOpen(false);
        },
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: t('confirm.deleteTitle'), message: t('confirm.deleteMessage'), danger: true, confirmText: t('common.delete') }))) return;
    setError('');
    try {
      await run(
        {
          key: `topstudent:delete:${id}`,
          label: t('action.delete'),
          kind: 'delete',
          successMessage: t('common.success'),
        },
        async () => {
          await api(`/api/admin/top-students/${id}`, { method: 'DELETE' });
          setStudents((prev) => prev.filter((s) => s.id !== id));
        },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon="🏆"
        title={t('admin.topStudents')}
        action={
          <button onClick={openNew} className="btn-fire w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white sm:w-auto">
            + {t('admin.addTopStudent')}
          </button>
        }
      />

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : students.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.topEmpty')}</p>
      ) : (
        <>
          {/* موبايل: بطاقات */}
          <div className="space-y-2 md:hidden">
            {students.map((s) => (
              <article key={s.id} className="card-fire rounded-2xl p-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-ink-800 ring-2 ring-fire-500/30">
                    {s.image ? (
                      <img src={s.image} alt={s.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-500">🎓</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-gray-100">{s.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-fire-500/15 px-2.5 py-0.5 text-xs font-black text-fire-300">#{s.rank}</span>
                      <GradeBadge grade={s.grade} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-800 pt-3">
                  <button onClick={() => openEdit(s)} className="btn-ghost-fire rounded-lg px-3 py-2.5 text-sm font-bold touch-target">
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded-lg border border-fire-500/40 px-3 py-2.5 text-sm font-bold text-fire-300 touch-target"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="card-fire hidden overflow-x-auto rounded-2xl md:block">
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
                          <img src={s.image} alt={s.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
                      <button onClick={() => openEdit(s)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold touch-target">
                        {t('common.edit')}
                      </button>
                      <button onClick={() => remove(s.id)} className="rounded-lg border border-fire-500/40 px-3 py-1 text-xs font-bold text-fire-300 touch-target">
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('admin.editTopStudent') : t('admin.addTopStudent')}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.topGrade')} *</label>
            <select className="input-fire w-full rounded-xl px-4 py-2.5" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
              {GRADE_KEYS.map((g) => (
                <option key={g} value={g}>
                  {t(GRADE_LABEL_KEY[g])}
                </option>
              ))}
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
                <img src={form.image} alt="preview" loading="lazy" decoding="async" className="h-16 w-16 rounded-xl object-cover ring-2 ring-fire-500/40" />
                <span className="text-xs text-emerald-400">✓ {t('admin.uploaded')}</span>
              </div>
            )}
          </div>
          {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-2 text-sm text-fire-300">{error}</div>}
          <AsyncButton
            type="submit"
            actionKey={editing ? `topstudent:edit:${editing.id}` : 'topstudent:new'}
            busy={uploading}
            className="w-full rounded-xl px-4 py-2.5 font-bold"
          >
            {t('common.save')}
          </AsyncButton>
        </form>
      </Modal>
    </div>
  );
}
