import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import GradeSelect from '../../components/GradeSelect';
import GradeBadge from '../../components/GradeBadge';

interface Course {
  id: number;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  image?: string;
  order?: number;
  grade?: string;
  lessonCount?: number;
}

const empty = { title: '', titleEn: '', description: '', descriptionEn: '', image: '', order: 0, grade: 'all' };

export default function CoursesAdmin() {
  const { t } = useLang();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ courses: Course[] }>('/api/courses')
      .then((d) => setCourses(d.courses))
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

  const openEdit = (c: Course) => {
    setEditing(c);
    setForm({ title: c.title, titleEn: c.titleEn || '', description: c.description || '', descriptionEn: c.descriptionEn || '', image: c.image || '', order: c.order ?? 0, grade: c.grade || 'all' });
    setError('');
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError(t('errors.required'));
    try {
      if (editing) {
        await api(`/api/courses/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await api('/api/courses', { method: 'POST', body: JSON.stringify(form) });
      }
      setOpen(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t('common.delete') + '?')) return;
    await api(`/api/courses/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">📚 {t('admin.courses')}</h1>
        <button onClick={openNew} className="btn-fire rounded-xl px-4 py-2 text-sm font-bold text-white">
          + {t('admin.addCourse')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : courses.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card-fire rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold">{c.title}</h3>
                  {c.titleEn && <p className="text-xs text-gray-500">{c.titleEn}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <GradeBadge grade={c.grade} />
                  <span className="rounded-full bg-fire-500/15 px-3 py-1 text-xs font-bold text-fire-300">{c.lessonCount ?? 0} {t('course.lessons')}</span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => openEdit(c)} className="btn-ghost-fire rounded-lg px-4 py-1.5 text-sm font-bold">
                  {t('common.edit')}
                </button>
                <button onClick={() => remove(c.id)} className="rounded-lg border border-fire-500/40 px-4 py-1.5 text-sm font-bold text-fire-300 hover:bg-fire-500/10">
                  {t('common.delete')}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('admin.editCourse') : t('admin.addCourse')}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('admin.courseTitle')} required>
            <input className="input-fire w-full rounded-xl px-4 py-2.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t('admin.courseTitleEn')}>
            <input className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
          </Field>
          <Field label={t('admin.courseDesc')}>
            <textarea className="input-fire w-full rounded-xl px-4 py-2.5" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={t('admin.courseDescEn')}>
            <textarea className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" rows={3} value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} />
          </Field>
          <Field label={t('admin.grade')}>
            <GradeSelect value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
          </Field>
          <Field label={`${t('admin.order')} (${t('common.optional')})`}>
            <input type="number" className="input-fire w-full rounded-xl px-4 py-2.5" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
          </Field>
          {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-2 text-sm text-fire-300">{error}</div>}
          <button type="submit" className="btn-fire w-full rounded-xl px-4 py-2.5 font-bold text-white">
            {t('common.save')}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-gray-300">
        {label} {required && <span className="text-fire-400">*</span>}
      </label>
      {children}
    </div>
  );
}
