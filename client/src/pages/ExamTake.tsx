import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import ProgressBar from '../components/ProgressBar';

interface Question {
  id: number;
  text: string;
  textEn: string;
  options: { text: string; textEn: string }[];
  correctIndex?: number;
  explanation?: string;
  explanationEn?: string;
}

interface SavedResult {
  best?: number;
  score?: number;
  attempts?: number;
  answers?: Record<string, number>;
}

interface ExamData {
  exam: { id: number; title: string; titleEn: string; timeLimit: number | null; passingScore: number; allowRetake?: boolean };
  questions: Question[];
  lastResult?: SavedResult | null;
}

interface ReviewItem {
  id: number;
  text: string;
  textEn: string;
  given: number | undefined;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  explanationEn: string;
}

interface Result {
  score: number;
  best: number;
  passed: boolean;
  correct: number;
  total: number;
  review: ReviewItem[];
}

// يبني المراجعة من الأسئلة + إجابات محفوظة (يُستخدم لمراجعة النتيجة عند العودة)
function buildReview(questions: Question[], answers: Record<string, number>): ReviewItem[] {
  return questions.map((q) => {
    const given = answers[String(q.id)];
    const correctIndex = q.correctIndex ?? 0;
    const isCorrect = given === undefined ? false : given === correctIndex;
    return {
      id: q.id,
      text: q.text,
      textEn: q.textEn,
      given,
      correctIndex,
      isCorrect,
      explanation: q.explanation ?? '',
      explanationEn: q.explanationEn ?? '',
    };
  });
}

// مكوّن مشترك لعرض ملخص النتيجة + مراجعة الأخطاء (يُستخدم في شاشة النتيجة وعند إعادة الدخول)
function ReviewPanel({ review, result, canRetake, onRetake, onBack }: { review: ReviewItem[]; result: Result; canRetake: boolean; onRetake: () => void; onBack: () => void }) {
  const { t, lang } = useLang();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card-fire rounded-3xl p-8 text-center">
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className={`mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full text-5xl ${
            result.passed ? 'bg-emerald-500/20' : 'bg-fire-500/20'
          }`}
        >
          {result.passed ? '🎉' : '😔'}
        </motion.div>
        <h1 className="text-2xl font-black">
          {result.passed ? t('exam.passed') : t('exam.failed')} — {result.score}%
        </h1>
        <p className="mt-2 text-gray-400">
          {t('exam.results')}: {result.correct}/{result.total} ({result.score}%)
        </p>
        <div className="mx-auto mt-4 max-w-xs">
          <ProgressBar value={result.score} />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {canRetake && (
            <button onClick={onRetake} className="btn-fire rounded-xl px-6 py-2.5 font-bold text-white">
              {t('exam.retake')}
            </button>
          )}
          <button onClick={onBack} className="btn-ghost-fire rounded-xl px-6 py-2.5 font-bold">
            {t('common.back')}
          </button>
        </div>
      </motion.div>

      <div className="card-fire rounded-2xl p-6">
        <h2 className="mb-4 text-lg font-extrabold">📋 {t('exam.review')}</h2>
        <div className="space-y-4">
          {review.map((q, i) => (
            <div key={q.id} className={`rounded-xl border p-4 ${q.isCorrect ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-fire-500/40 bg-fire-500/5'}`}>
              <p className="font-bold">
                {i + 1}. {lang === 'ar' ? q.text : q.textEn}
              </p>
              <div className="mt-2 space-y-1 text-sm">
                {q.given !== undefined ? (
                  <p className={q.isCorrect ? 'text-emerald-300' : 'text-fire-300'}>
                    {t('exam.yourAnswer')}: {String.fromCharCode(65 + q.given)}
                  </p>
                ) : (
                  <p className="text-gray-500">{t('exam.yourAnswer')}: —</p>
                )}
                <p className="text-emerald-300">
                  {t('exam.correctAnswer')}: {String.fromCharCode(65 + q.correctIndex)}
                </p>
              </div>
              {(lang === 'ar' ? q.explanation : q.explanationEn || q.explanation) ? (
                <div className="mt-2 rounded-lg border border-ink-600 bg-ink-900/60 px-3 py-2 text-sm text-gray-300">
                  <span className="font-bold text-fire-300">💡 {t('exam.explanation')}: </span>
                  {lang === 'ar' ? q.explanation : q.explanationEn || q.explanation}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ExamTake() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { applyExamResult } = useAuth();
  const [data, setData] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [showSavedReview, setShowSavedReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<ExamData>(`/api/exams/${id}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const answeredCount = Object.keys(answers).length;
  const remaining = data ? data.questions.length - answeredCount : 0;

  const submit = async () => {
    if (!id) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api<Result>(`/api/exams/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      setResult(res);
      applyExamResult({
        examId: Number(id),
        best: res.best,
        score: res.score,
        correct: res.correct,
        total: res.total,
        attempts: (data?.lastResult?.attempts ?? 0) + 1,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setResult(null);
    setAnswers({});
    setError('');
    setSubmitting(false);
    setShowSavedReview(false);
  };

  if (loading) return <p className="text-gray-400">{t('common.loading')}</p>;
  if (!data) return <p className="text-gray-400">{error || t('errors.generic')}</p>;

  const { exam, questions } = data;
  const canRetake = !!exam.allowRetake;

  // نتيجة/مراجعة مُخزّنة من آخر محاولة (تُبنى في المتصفح من إجابات محفوظة — بدون أي استعلام إضافي)
  const savedReview = data.lastResult?.answers
    ? buildReview(questions, data.lastResult.answers)
    : null;
  const savedResult: Result | null = data.lastResult
    ? {
        score: data.lastResult.score ?? 0,
        best: data.lastResult.best ?? data.lastResult.score ?? 0,
        passed: (data.lastResult.score ?? 0) >= (exam.passingScore ?? 50),
        correct: savedReview?.filter((r) => r.isCorrect).length ?? 0,
        total: questions.length,
        review: savedReview ?? [],
      }
    : null;

  // أدّى الامتحان من قبل ولا يسمح الأدمن بإعادته → نعرض النتيجة + مراجعة الأخطاء دائماً (حتى بعد الخروج والعودة)
  if (data.lastResult && !canRetake && savedResult) {
    return (
      <ReviewPanel
        review={savedResult.review}
        result={savedResult}
        canRetake={false}
        onRetake={() => {}}
        onBack={() => navigate('/exams')}
      />
    );
  }

  // شاشة النتيجة (بعد التسليم مباشرة في نفس الجلسة)
  if (result) {
    return (
      <ReviewPanel
        review={result.review}
        result={result}
        canRetake={canRetake}
        onRetake={retake}
        onBack={() => navigate('/exams')}
      />
    );
  }

  // أدّى الامتحان من قبل ويسمح الأدمن بإعادته + اختار عرض مراجعة آخر محاولة
  if (data.lastResult && canRetake && savedResult && showSavedReview) {
    return (
      <ReviewPanel
        review={savedResult.review}
        result={savedResult}
        canRetake={canRetake}
        onRetake={retake}
        onBack={() => navigate('/exams')}
      />
    );
  }

  // أدّى الامتحان من قبل ويسمح بإعادته → شاشة ترحيب مع خيار استعراض آخر محاولة قبل الإعادة
  if (data.lastResult && canRetake && savedResult) {
    return (
      <div className="mx-auto max-w-lg">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card-fire rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20 text-4xl">📋</div>
          <h1 className="text-2xl font-black">{lang === 'ar' ? exam.title : exam.titleEn}</h1>
          <p className="mt-2 text-sm text-gray-400">{t('exam.retakeBeforeReview')}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-ink-900 p-4">
              <div className="text-xs text-gray-500">{t('exam.bestScore')}</div>
              <div className="text-2xl font-black text-fire-400">{savedResult.best}%</div>
            </div>
            <div className="rounded-xl bg-ink-900 p-4">
              <div className="text-xs text-gray-500">{t('exam.attempts')}</div>
              <div className="text-2xl font-black text-gray-200">{data.lastResult.attempts ?? 1}</div>
            </div>
          </div>
          <button onClick={() => setShowSavedReview(true)} className="btn-fire mt-6 w-full rounded-xl px-6 py-2.5 font-bold text-white">
            🔍 {t('exam.viewLastReview')}
          </button>
          <button onClick={retake} className="btn-ghost-fire mt-3 w-full rounded-xl px-6 py-2.5 font-bold">
            {t('exam.retake')}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="card-fire rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-black">📋 {lang === 'ar' ? exam.title : exam.titleEn}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            {exam.timeLimit ? <span>⏱️ {exam.timeLimit} {t('exam.timeLimit')}</span> : null}
            <span>
              {answeredCount}/{questions.length} {t('exam.questionsCount')}
            </span>
          </div>
        </div>
        <ProgressBar value={questions.length ? (answeredCount / questions.length) * 100 : 0} className="mt-3" />
        {remaining > 0 && <p className="mt-1 text-xs text-ember-400">{t('exam.unansweredWarning')} ({remaining})</p>}
      </div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      <div className="space-y-5">
        {questions.map((q, qi) => (
          <motion.div key={q.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: qi * 0.05 }} className="card-fire rounded-2xl p-5">
            <p className="font-bold">
              <span className="text-fire-400">{t('exam.question')} {qi + 1} {t('exam.of')} {questions.length}.</span> {lang === 'ar' ? q.text : q.textEn}
            </p>
            <div className="mt-4 space-y-2">
              {q.options.map((opt, oi) => {
                const selected = answers[q.id] === oi;
                return (
                  <button
                    key={oi}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start text-sm transition-all ${
                      selected ? 'border-fire-500 bg-fire-500/15 font-bold' : 'border-ink-600 bg-ink-900 hover:border-fire-500/50'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${selected ? 'bg-gradient-to-br from-fire-600 to-ember-500 text-white' : 'bg-ink-700 text-gray-300'}`}>
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {lang === 'ar' ? opt.text : opt.textEn}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {questions.length === 0 && <p className="rounded-2xl border border-ink-600 bg-ink-900 p-8 text-center text-gray-400">{t('exam.noQuestions')}</p>}

      {questions.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => navigate('/exams')} className="btn-ghost-fire rounded-xl px-5 py-2.5 text-sm font-bold">
            {t('common.back')}
          </button>
          <button onClick={submit} disabled={submitting} className="btn-fire rounded-xl px-6 py-2.5 font-bold text-white disabled:opacity-50">
            {submitting ? t('common.loading') : t('exam.submit')}
          </button>
        </div>
      )}

    </div>
  );
}
