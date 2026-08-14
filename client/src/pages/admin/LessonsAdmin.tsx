import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../../i18n';
import { api } from '../../api/client';
import { uploadFile } from '../../api/upload';
import Modal from '../../components/Modal';
import GradeSelect from '../../components/GradeSelect';
import GradeBadge from '../../components/GradeBadge';

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
    setForm({ courseId: l.courseId, title: l.title, titleEn: l.titleEn || '', videoType: l.videoType, videoUrl: l.videoUrl, duration: l.duration, description: l.description || '', order: l.order ?? 0, grade: l.grade || 'all' });
    setError('');
    setOpen(true);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadFile('videos', file);
      setForm((f) => ({ ...f, videoType: 'upload', videoUrl: url }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.courseId || !form.title.trim() || !form.videoUrl.trim()) {
      return setError(t('errors.required'));
    }
    try {
      if (editing) {
        await api(`/api/lessons/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await api('/api/lessons', { method: 'POST', body: JSON.stringify(form) });
      }
      setOpen(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t('common.delete') + '?')) return;
    try {
      await api(`/api/lessons/${id}`, { method: 'DELETE' });
      load();
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">🎬 {t('admin.lessons')}</h1>
        <button onClick={openNew} disabled={courses.length === 0} className="btn-fire rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          + {t('admin.addLesson')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : lessons.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lessons.map((l, i) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card-fire rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-bold">{lang === 'ar' ? l.title : l.titleEn}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <GradeBadge grade={l.grade} />
                    <span>{courseName(l.courseId)} · {l.videoType === 'youtube' ? '▶ YouTube' : '📁 ملف'} · {l.duration}s</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => openEdit(l)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold">
                    {t('common.edit')}
                  </button>
                  <button onClick={() => remove(l.id)} className="rounded-lg border border-fire-500/40 px-3 py-1 text-xs font-bold text-fire-300">
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
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm({ ...form, videoType: 'youtube' })} className={`rounded-xl border px-4 py-2 text-sm font-bold ${form.videoType === 'youtube' ? 'border-fire-500 bg-fire-500/15 text-fire-300' : 'border-ink-600 bg-ink-900 text-gray-400'}`}>
                ▶ {t('admin.youtube')}
              </button>
              <button type="button" onClick={() => setForm({ ...form, videoType: 'upload' })} className={`rounded-xl border px-4 py-2 text-sm font-bold ${form.videoType === 'upload' ? 'border-fire-500 bg-fire-500/15 text-fire-300' : 'border-ink-600 bg-ink-900 text-gray-400'}`}>
                📁 {t('admin.upload')}
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
              <input type="number" min={0} className="input-fire w-full rounded-xl px-4 py-2.5" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
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
          <button type="submit" className="btn-fire w-full rounded-xl px-4 py-2.5 font-bold text-white">
            {t('common.save')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
