import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import { uploadFile } from '../../api/upload';
import Modal from '../../components/Modal';
import GradeSelect from '../../components/GradeSelect';
import GradeBadge from '../../components/GradeBadge';

interface Note {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  body: string;
  bodyEn: string;
  image?: string;
  order?: number;
  grade?: string;
}

const empty = { courseId: 0, title: '', titleEn: '', body: '', bodyEn: '', image: '', order: 0, grade: 'all' };

export default function NotesAdmin() {
  const { t } = useLang();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    api<{ notes: Note[] }>('/api/notes')
      .then((d) => setNotes(d.notes))
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
  const openEdit = (n: Note) => {
    setEditing(n);
    setForm({ courseId: n.courseId ?? 0, title: n.title, titleEn: n.titleEn || '', body: n.body || '', bodyEn: n.bodyEn || '', image: n.image || '', order: n.order ?? 0, grade: n.grade || 'all' });
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
    if (!form.title.trim()) return setError(t('errors.required'));
    try {
      const body = { ...form, courseId: form.courseId || null };
      if (editing) await api(`/api/notes/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/notes', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t('common.delete') + '?')) return;
    try {
      await api(`/api/notes/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">📖 {t('admin.notes')}</h1>
        <button onClick={openNew} className="btn-fire rounded-xl px-4 py-2 text-sm font-bold text-white">
          + {t('admin.addNote')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : notes.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((n, i) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card-fire rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-bold">{n.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <GradeBadge grade={n.grade} />
                    <span className="line-clamp-1">{n.body.slice(0, 120)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => openEdit(n)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold">
                    {t('common.edit')}
                  </button>
                  <button onClick={() => remove(n.id)} className="rounded-lg border border-fire-500/40 px-3 py-1 text-xs font-bold text-fire-300">
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('admin.editNote') : t('admin.addNote')}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.grade')}</label>
            <GradeSelect value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.noteTitle')} *</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.noteTitleEn')}</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.noteBody')}</label>
            <textarea className="input-fire w-full rounded-xl px-4 py-2.5 font-mono text-sm" rows={6} placeholder="## Markdown" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.noteBodyEn')}</label>
            <textarea className="input-fire w-full rounded-xl px-4 py-2.5 font-mono text-sm" dir="ltr" rows={6} placeholder="## Markdown" value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.imageUrl')} — {t('admin.uploadImage')}</label>
            <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} className="input-fire w-full rounded-xl px-4 py-2.5 text-sm" />
            {uploading && <p className="mt-1 text-xs text-ember-400">{t('admin.uploading')}...</p>}
            <input className="input-fire mt-2 w-full rounded-xl px-4 py-2 text-sm" dir="ltr" placeholder="/uploads/..." value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
            {form.image && !uploading && <p className="mt-1 text-xs text-emerald-400">✓ {t('admin.uploaded')}</p>}
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
