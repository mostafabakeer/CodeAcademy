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
}
interface Exam {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  passingScore: number;
  timeLimit: number | null;
  order?: number;
  grade?: string;
  allowRetake?: boolean;
  questionsCount?: number;
}
interface Question {
  id: number;
  text: string;
  textEn: string;
  options: { text: string; textEn: string }[];
  correctIndex: number;
}

const emptyExam = { courseId: 0, title: '', titleEn: '', passingScore: 50, timeLimit: 0, order: 0, grade: 'all', allowRetake: false };

export default function ExamsAdmin() {
  const { t, lang } = useLang();
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // نموذج الامتحان
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState(emptyExam);
  // مدير الأسئلة
  const [qmExam, setQmExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qOpen, setQOpen] = useState(false);
  const [qEditing, setQEditing] = useState<Question | null>(null);
  const [qForm, setQForm] = useState({ text: '', textEn: '', options: ['', '', '', ''], optionsEn: ['', '', '', ''], correctIndex: 0 });
  const [qError, setQError] = useState('');

  const load = useCallback(async () => {
    try {
      const c = await api<{ courses: Course[] }>('/api/courses');
      setCourses(c.courses);
      const e = await api<{ exams: Exam[] }>('/api/exams');
      setExams(e.exams);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadQuestions = async (examId: number) => {
    try {
      const d = await api<{ questions: Question[] }>(`/api/admin/exams/${examId}/questions`);
      setQuestions(d.questions);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openExam = () => {
    setEditing(null);
    setForm({ ...emptyExam, courseId: courses[0]?.id ?? 0 });
    setError('');
    setOpen(true);
  };
  const editExam = (e: Exam) => {
    setEditing(e);
    setForm({ courseId: e.courseId ?? 0, title: e.title, titleEn: e.titleEn || '', passingScore: e.passingScore, timeLimit: e.timeLimit ?? 0, order: e.order ?? 0, grade: e.grade || 'all', allowRetake: !!e.allowRetake });
    setError('');
    setOpen(true);
  };

  const submitExam = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError(t('errors.required'));
    try {
      const body = { ...form, timeLimit: form.timeLimit > 0 ? form.timeLimit : null, courseId: form.courseId || null };
      if (editing) await api(`/api/exams/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/exams', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeExam = async (id: number) => {
    if (!window.confirm(t('common.delete') + '?')) return;
    try {
      await api(`/api/exams/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openQuestions = async (e: Exam) => {
    setQmExam(e);
    await loadQuestions(e.id);
  };

  const openNewQ = () => {
    setQEditing(null);
    setQForm({ text: '', textEn: '', options: ['', '', '', ''], optionsEn: ['', '', '', ''], correctIndex: 0 });
    setQError('');
    setQOpen(true);
  };
  const editQ = (q: Question) => {
    setQEditing(q);
    setQForm({
      text: q.text,
      textEn: q.textEn || '',
      options: q.options.map((o) => o.text),
      optionsEn: q.options.map((o) => o.textEn || ''),
      correctIndex: q.correctIndex,
    });
    setQError('');
    setQOpen(true);
  };

  const submitQ = async (e: FormEvent) => {
    e.preventDefault();
    setQError('');
    if (!qmExam) return;
    if (!qForm.text.trim()) return setQError(t('errors.required'));
    const options = qForm.options.slice(0, 4).filter((o) => o.trim() !== '');
    const optionsEn = qForm.optionsEn.slice(0, 4);
    if (options.length < 2) return setQError(t('errors.required'));
    try {
      const body = {
        text: qForm.text,
        textEn: qForm.textEn,
        options: options.map((text, i) => ({ text, textEn: optionsEn[i] ?? '' })),
        correctIndex: qForm.correctIndex,
      };
      if (qEditing) await api(`/api/questions/${qEditing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api(`/api/exams/${qmExam.id}/questions`, { method: 'POST', body: JSON.stringify(body) });
      setQOpen(false);
      await loadQuestions(qmExam.id);
    } catch (err) {
      setQError((err as Error).message);
    }
  };

  const removeQ = async (id: number) => {
    if (!window.confirm(t('common.delete') + '?')) return;
    try {
      await api(`/api/questions/${id}`, { method: 'DELETE' });
      if (qmExam) await loadQuestions(qmExam.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const courseName = (id: number | null) => {
    const c = courses.find((x) => x.id === id);
    return c ? (lang === 'ar' ? c.title : c.titleEn) : '—';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">📝 {t('admin.exams')}</h1>
        <button onClick={openExam} className="btn-fire rounded-xl px-4 py-2 text-sm font-bold text-white">
          + {t('admin.addExam')}
        </button>
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : exams.length === 0 ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('admin.noData')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {exams.map((e, i) => (
            <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card-fire rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-bold">{lang === 'ar' ? e.title : e.titleEn}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <GradeBadge grade={e.grade} />
                    <span>
                      {courseName(e.courseId)} · {e.questionsCount ?? 0} {t('admin.questions')} · {t('admin.passingScore')} {e.passingScore}%
                    </span>
                    {!!e.allowRetake && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-300">↻ {t('admin.allowRetake')}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => openQuestions(e)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold">
                    {t('admin.questions')}
                  </button>
                  <button onClick={() => editExam(e)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold">
                    {t('common.edit')}
                  </button>
                  <button onClick={() => removeExam(e.id)} className="rounded-lg border border-fire-500/40 px-3 py-1 text-xs font-bold text-fire-300">
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* نموذج الامتحان */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('admin.editExam') : t('admin.addExam')}>
        <form onSubmit={submitExam} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.course')} ({t('common.optional')})</label>
            <select className="input-fire w-full rounded-xl px-4 py-2.5" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: Number(e.target.value) })}>
              <option value={0}>—</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'ar' ? c.title : c.titleEn}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.examTitle')} *</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.examTitleEn')}</label>
              <input className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.passingScore')}</label>
              <input type="number" min={0} max={100} className="input-fire w-full rounded-xl px-4 py-2.5" value={form.passingScore} onChange={(e) => setForm({ ...form, passingScore: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.timeLimitMin')}</label>
              <input type="number" min={0} className="input-fire w-full rounded-xl px-4 py-2.5" value={form.timeLimit} onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.grade')}</label>
            <GradeSelect value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-600 bg-ink-900 px-4 py-3">
            <input
              type="checkbox"
              checked={form.allowRetake}
              onChange={(e) => setForm({ ...form, allowRetake: e.target.checked })}
              className="h-4 w-4 accent-fire-500"
            />
            <span className="text-sm font-semibold text-gray-300">{t('admin.allowRetake')}</span>
          </label>
          {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-2 text-sm text-fire-300">{error}</div>}
          <button type="submit" className="btn-fire w-full rounded-xl px-4 py-2.5 font-bold text-white">
            {t('common.save')}
          </button>
        </form>
      </Modal>

      {/* مدير الأسئلة */}
      <Modal open={!!qmExam} onClose={() => setQmExam(null)} title={qmExam ? `${t('admin.questions')} — ${lang === 'ar' ? qmExam.title : qmExam.titleEn}` : ''}>
        <div className="mb-4 flex justify-end">
          <button onClick={openNewQ} className="btn-fire rounded-xl px-4 py-2 text-sm font-bold text-white">
            + {t('admin.addQuestion')}
          </button>
        </div>
        {questions.length === 0 ? (
          <p className="rounded-xl bg-ink-900 p-6 text-center text-gray-400">{t('admin.noData')}</p>
        ) : (
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-ink-600 bg-ink-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {i + 1}. {q.text}
                    </p>
                    <div className="mt-1.5 space-y-0.5 text-sm text-gray-400">
                      {q.options.map((o, oi) => (
                        <div key={oi}>
                          {String.fromCharCode(65 + oi)}. {o.text} {oi === q.correctIndex && <span className="text-emerald-400">✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => editQ(q)} className="btn-ghost-fire rounded-lg px-3 py-1 text-xs font-bold">
                      {t('common.edit')}
                    </button>
                    <button onClick={() => removeQ(q.id)} className="rounded-lg border border-fire-500/40 px-3 py-1 text-xs font-bold text-fire-300">
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* نموذج السؤال */}
      <Modal open={qOpen} onClose={() => setQOpen(false)} title={qEditing ? t('common.edit') : t('admin.addQuestion')}>
        <form onSubmit={submitQ} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.questionText')} *</label>
              <textarea className="input-fire w-full rounded-xl px-4 py-2.5" rows={2} value={qForm.text} onChange={(e) => setQForm({ ...qForm, text: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.questionTextEn')}</label>
              <textarea className="input-fire w-full rounded-xl px-4 py-2.5" dir="ltr" rows={2} value={qForm.textEn} onChange={(e) => setQForm({ ...qForm, textEn: e.target.value })} />
            </div>
          </div>
          {qForm.options.map((_, i) => (
            <div key={i} className="grid grid-cols-[30px_1fr] gap-2">
              <span className="flex items-center justify-center rounded-lg bg-ink-700 text-sm font-black text-gray-300">{String.fromCharCode(65 + i)}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input-fire rounded-xl px-3 py-2 text-sm" placeholder={t('admin.optionText', { n: i + 1 })} value={qForm.options[i]} onChange={(e) => setQForm({ ...qForm, options: qForm.options.map((o, oi) => (oi === i ? e.target.value : o)) })} />
                <input className="input-fire rounded-xl px-3 py-2 text-sm" dir="ltr" placeholder={t('admin.optionTextEn', { n: i + 1 })} value={qForm.optionsEn[i]} onChange={(e) => setQForm({ ...qForm, optionsEn: qForm.optionsEn.map((o, oi) => (oi === i ? e.target.value : o)) })} />
              </div>
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-300">{t('admin.correctOption')} *</label>
            <select className="input-fire w-full rounded-xl px-4 py-2.5" value={qForm.correctIndex} onChange={(e) => setQForm({ ...qForm, correctIndex: Number(e.target.value) })}>
              {qForm.options.map((_, i) => (
                <option key={i} value={i}>
                  {String.fromCharCode(65 + i)}
                </option>
              ))}
            </select>
          </div>
          {qError && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-2 text-sm text-fire-300">{qError}</div>}
          <button type="submit" className="btn-fire w-full rounded-xl px-4 py-2.5 font-bold text-white">
            {t('common.save')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
