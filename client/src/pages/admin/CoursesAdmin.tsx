import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import AdminPageHeader from './AdminPageHeader';
import { api } from '../../api/client';
import { uploadFile } from '../../api/upload';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import GradeSelect from '../../components/GradeSelect';
import GradeBadge from '../../components/GradeBadge';
import AsyncButton from '../../components/AsyncButton';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useAction } from '../../store/actionStore';

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
  const run = useAction();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

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

  const onImageUpload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      await run(
        { key: 'course:image', label: t('action.upload'), kind: 'upload' },
        async ({ setProgress }) => {
          const url = await uploadFile('images', file, {
            grade: form.grade,
            onProgress: setProgress,
          });
          setForm((f) => ({ ...f, image: url }));
        },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError(t('errors.required'));
    try {
      await run(
        {
          key: editing ? `course:edit:${editing.id}` : 'course:new',
          label: t('action.save'),
          kind: 'save',
          successMessage: t('common.success'),
        },
        async () => {
          if (editing) {
            const d = await api<{ course: Course }>(`/api/courses/${editing.id}`, {
              method: 'PUT',
              body: JSON.stringify(form),
            });
            // تحديث فوري من الاستجابة بدل إعادة تحميل القائمة من الشبكة.
            setCourses((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...d.course } : c)));
          } else {
            const d = await api<{ course: Course }>('/api/courses', {
              method: 'POST',
              body: JSON.stringify(form),
            });
            setCourses((prev) => [d.course, ...prev]);
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
          key: `course:delete:${id}`,
          label: t('action.delete'),
          kind: 'delete',
          successMessage: t('common.success'),
        },
        async () => {
          await api(`/api/courses/${id}`, { method: 'DELETE' });
          setCourses((prev) => prev.filter((c) => c.id !== id));
        },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon="📚"
        title={t('admin.courses')}
        action={
          <button onClick={openNew} className="btn-fire w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white sm:w-auto">
            + {t('admin.addCourse')}
          </button>
        }
      />

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : courses.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 grid-cols-admin-mobile">
          {courses.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card-fire rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-extrabold truncate">{c.title}</h3>
                  {c.titleEn && <p className="text-xs text-gray-500 truncate">{c.titleEn}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 sm:shrink-0">
                  <GradeBadge grade={c.grade} />
                  <span className="rounded-full bg-fire-500/15 px-3 py-1 text-xs font-bold text-fire-300 whitespace-nowrap">{c.lessonCount ?? 0} {t('course.lessons')}</span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => openEdit(c)} className="btn-ghost-fire flex-1 rounded-lg px-4 py-2.5 text-sm font-bold touch-target">
                  {t('common.edit')}
                </button>
                <button onClick={() => remove(c.id)} className="flex-1 rounded-lg border border-fire-500/40 px-4 py-2.5 text-sm font-bold text-fire-300 hover:bg-fire-500/10 touch-target">
                  {t('common.delete')}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('admin.editCourse') : t('admin.addCourse')}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label={t('admin.courseTitle')} required>
            <input className="input-fire w-full rounded-xl px-4 py-2.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          <FormField label={t('admin.courseTitleEn')}>
            <input className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
          </FormField>
          <FormField label={t('admin.courseDesc')}>
            <textarea className="input-fire w-full rounded-xl px-4 py-2.5" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <FormField label={t('admin.courseDescEn')}>
            <textarea className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" rows={3} value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} />
          </FormField>
          <div className="rounded-2xl border border-fire-500/30 bg-fire-950/20 p-4">
            <label className="mb-1.5 block text-sm font-bold text-fire-200">{t('admin.imageUrl')} — {t('admin.uploadImage')}</label>
            <input type="file" accept="image/*" onChange={(e) => onImageUpload(e.target.files?.[0])} className="input-fire w-full rounded-xl px-4 py-2.5 text-sm" />
            {uploadingImage && <p className="mt-1 text-xs text-ember-400">{t('admin.uploading')}...</p>}
            {form.image && !uploadingImage && <p className="mt-1 text-xs text-emerald-400">✓ {t('admin.uploaded')}</p>}
            <p className="mt-1 text-xs text-gray-400">{t('admin.imageUrlHint')}</p>
          </div>
          <FormField label={t('admin.grade')}>
            <GradeSelect value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
          </FormField>
          <FormField label={`${t('admin.order')} (${t('common.optional')})`}>
            <input type="number" className="input-fire w-full rounded-xl px-4 py-2.5" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
          </FormField>
          {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-2 text-sm text-fire-300">{error}</div>}
          <AsyncButton
            type="submit"
            actionKey={editing ? `course:edit:${editing.id}` : 'course:new'}
            className="w-full rounded-xl px-4 py-2.5 font-bold"
          >
            {t('common.save')}
          </AsyncButton>
        </form>
      </Modal>
    </div>
  );
}


