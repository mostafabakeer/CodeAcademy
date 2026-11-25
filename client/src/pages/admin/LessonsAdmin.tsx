import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import AdminPageHeader from './AdminPageHeader';
import { api } from '../../api/client';
import { uploadFile } from '../../api/upload';
import Modal from '../../components/Modal';
import GradeSelect from '../../components/GradeSelect';
import GradeBadge from '../../components/GradeBadge';
import AsyncButton from '../../components/AsyncButton';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useAction } from '../../store/actionStore';

interface Course {
  id: number;
  title: string;
  titleEn: string;
  grade?: string;
}
interface Lesson {
  id: number;
  courseId: number;
  title: string;
  titleEn: string;
  videoType: 'youtube' | 'upload';
  videoUrl: string;
  duration: number;
  description: string;
  order?: number;
  grade?: string;
}

const empty = { courseId: 0, title: '', titleEn: '', videoType: 'youtube' as 'youtube' | 'upload', videoUrl: '', duration: 0, description: '', order: 0, grade: 'all' };

export default function LessonsAdmin() {
  const { t, lang } = useLang();
  const run = useAction();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ lessons: Lesson[]; courses: Course[] }>('/api/admin/lessons');
      setCourses(d.courses);
      setLessons(d.lessons);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, courseId: courses[0]?.id ?? 0, grade: courses[0]?.grade ?? 'all' });
    setError('');
    setOpen(true);
  };

  const openEdit = (l: Lesson) => {
    setEditing(l);
    setForm({ courseId: l.courseId, title: l.title, titleEn: l.titleEn || '', videoType: l.videoType, videoUrl: l.videoUrl, duration: Math.round(l.duration / 60), description: l.description || '', order: l.order ?? 0, grade: l.grade || 'all' });
    setError('');
    setOpen(true);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      await run(
        { key: 'lesson:video', label: t('action.upload'), kind: 'upload' },
        async ({ setProgress }) => {
          const url = await uploadFile('videos', file, {
            grade: form.grade,
            courseId: form.courseId || undefined,
            onProgress: setProgress,
          });
          setForm((f) => ({ ...f, videoType: 'upload', videoUrl: url }));
        },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.courseId || !form.title.trim() || !form.videoUrl.trim()) {
      return setError(t('errors.required'));
    }
    try {
      await run(
        {
          key: editing ? `lesson:edit:${editing.id}` : 'lesson:new',
          label: t('action.save'),
          kind: 'save',
          successMessage: t('common.success'),
        },
        async () => {
          const body = { ...form, duration: form.duration * 60 };
          if (editing) {
            const d = await api<{ lesson: Lesson }>(`/api/lessons/${editing.id}`, {
              method: 'PUT',
              body: JSON.stringify(body),
            });
            setLessons((prev) => prev.map((l) => (l.id === editing.id ? { ...l, ...d.lesson } : l)));
          } else {
            const d = await api<{ lesson: Lesson }>('/api/lessons', {
              method: 'POST',
              body: JSON.stringify(body),
            });
            setLessons((prev) => [...prev, d.lesson]);
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
          key: `lesson:delete:${id}`,
          label: t('action.delete'),
          kind: 'delete',
          successMessage: t('common.success'),
        },
        async () => {
          await api(`/api/lessons/${id}`, { method: 'DELETE' });
          setLessons((prev) => prev.filter((l) => l.id !== id));
        },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const courseName = (id: number) => {
    const c = courses.find((x) => x.id === id);
    return c ? (lang === 'ar' ? c.title : c.titleEn) : `#${id}`;
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon="🎬"
        title={t('admin.lessons')}
        action={
          <button
            onClick={openNew}
            disabled={courses.length === 0}
            className="btn-fire w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
          >
            + {t('admin.addLesson')}
          </button>
        }
      />

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : lessons.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 grid-cols-admin-mobile">
          {lessons.map((l, i) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card-fire rounded-2xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-bold">{lang === 'ar' ? l.title : l.titleEn}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <GradeBadge grade={l.grade} />
                    <span className="truncate max-w-[200px] sm:max-w-none">{courseName(l.courseId)} · {l.videoType === 'youtube' ? '▶ YouTube' : '📁 ملف'} · {Math.round(l.duration / 60)} {t('admin.minutes')}</span>
                  </div>
                </div>
                <div className="flex gap-2 sm:shrink-0">
                  <button onClick={() => openEdit(l)} className="btn-ghost-fire flex-1 rounded-lg px-3 py-2.5 text-xs font-bold sm:flex-none sm:py-1 touch-target">
                    {t('common.edit')}
                  </button>
                  <button onClick={() => remove(l.id)} className="flex-1 rounded-lg border border-fire-500/40 px-3 py-2.5 text-xs font-bold text-fire-300 sm:flex-none sm:py-1 touch-target">
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('admin.editLesson') : t('admin.addLesson')}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.selectCourse')} *</label>
            <select className="input-fire w-full rounded-xl px-4 py-2.5" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: Number(e.target.value) })}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'ar' ? c.title : c.titleEn}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.lessonTitle')} *</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.lessonTitleEn')}</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.videoType')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm({ ...form, videoType: 'youtube' })} className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 ${form.videoType === 'youtube' ? 'border-fire-500 bg-fire-500/15 text-fire-300' : 'border-ink-600 bg-ink-900 text-gray-400'}`}>
                <span className="text-lg">▶</span> {t('admin.youtube')}
              </button>
              <button type="button" onClick={() => setForm({ ...form, videoType: 'upload' })} className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 ${form.videoType === 'upload' ? 'border-fire-500 bg-fire-500/15 text-fire-300' : 'border-ink-600 bg-ink-900 text-gray-400'}`}>
                <span className="text-lg">📁</span> {t('admin.upload')}
              </button>
            </div>
          </div>
          {form.videoType === 'youtube' ? (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.videoUrl')} *</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" placeholder="https://www.youtube.com/watch?v=..." value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.uploadVideo')}</label>
              <input type="file" accept="video/*" onChange={(e) => onUpload(e.target.files?.[0])} className="input-fire w-full rounded-xl px-4 py-2.5 text-sm" />
              {uploading && <p className="mt-1 text-xs text-ember-400">{t('admin.uploading')}...</p>}
              {form.videoUrl && !uploading && (
                <p className="mt-1 truncate text-xs text-emerald-400">✓ {t('admin.uploaded')}: {form.videoUrl}</p>
              )}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.grade')}</label>
            <GradeSelect value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.duration')} *</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} className="input-fire flex-1 rounded-xl px-4 py-2.5" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
                <span className="text-sm text-gray-400">{t('admin.minutes')}</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.order')}</label>
              <input type="number" className="input-fire w-full rounded-xl px-4 py-2.5" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.lessonDesc')}</label>
            <textarea className="input-fire w-full rounded-xl px-4 py-2.5" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-2 text-sm text-fire-300">{error}</div>}
          <AsyncButton
            type="submit"
            actionKey={editing ? `lesson:edit:${editing.id}` : 'lesson:new'}
            className="w-full rounded-xl px-4 py-2.5 font-bold"
          >
            {t('common.save')}
          </AsyncButton>
        </form>
      </Modal>
    </div>
  );
}
