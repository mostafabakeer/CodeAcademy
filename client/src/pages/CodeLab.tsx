import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { api } from '../api/client';
import CodeEditor from '../components/CodeEditor';
import { getCodeDraft, setCodeDraft, clearCodeDraft } from '../lib/localStore';

interface CodeFile {
  id: number;
  name: string;
  language: string;
  code: string;
  versions?: { at: number; code: string }[];
  updatedAt: number;
  createdAt: number;
}

const LANGUAGES = ['javascript', 'python', 'html', 'css'] as const;

const WORKER_TIMEOUT_MS = 5000;

/**
 * تشغيل كود المستخدم داخل Web Worker معزول (Blob): لا يصل لأصل الموقع ولا DOM
 * ولا localStorage، وتُقتل الحلقات اللانهائية عبر terminate بعد المهلة.
 */
async function runJavaScript(code: string): Promise<string> {
  const workerSource = `
    self.onmessage = async (e) => {
      const code = e.data.code;
      const logs = [];
      const formatValue = (v) => {
        if (typeof v === 'string') return v;
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        if (typeof v === 'function') return String(v);
        try {
          const json = JSON.stringify(v, null, 2);
          return json === undefined ? String(v) : json;
        } catch (_) {
          return String(v);
        }
      };
      const capture = (prefix) => (...args) => logs.push(prefix + args.map(formatValue).join(' '));
      self.console.log = capture('');
      self.console.error = capture('❌ ');
      self.console.warn = capture('⚠️ ');
      self.console.info = capture('ℹ️ ');
      try {
        const fn = new Function(code);
        const result = await fn();
        if (result !== undefined) logs.push(formatValue(result));
        if (logs.length === 0) logs.push('✓');
      } catch (err) {
        logs.push('❌ ' + (err && err.message ? err.message : String(err)));
      }
      self.postMessage({ logs });
    };
  `;

  return new Promise<string>((resolve) => {
    let worker: Worker | null = null;
    let settled = false;
    const finish = (text: string) => {
      if (settled) return;
      settled = true;
      try {
        worker?.terminate();
      } catch {}
      resolve(text);
    };

    try {
      const blob = new Blob([workerSource], { type: 'text/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
    } catch {
      finish('❌ تعذر تشغيل العامل — تحقق من دعم المتصفح');
      return;
    }

    const timer = setTimeout(() => finish('❌ انتهت مهلة التنفيذ (5 ثوانٍ) — تحقق من وجود حلقة لا نهائية'), WORKER_TIMEOUT_MS);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      finish(e.data?.logs?.join('\n') ?? '');
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      finish('❌ ' + (e.message || 'خطأ في التنفيذ'));
    };
    worker.postMessage({ code });
  });
}

function resolveLocalRefs(html: string, files: { name: string; language: string; code: string }[]): string {
  const byName = new Map<string, { language: string; code: string }>();
  const addRef = (name: string, file: { language: string; code: string }) => {
    byName.set(name.toLowerCase(), file);
    const base = name.split('/').pop();
    if (base) byName.set(base.toLowerCase(), file);
  };
  for (const f of files) addRef(f.name, { language: f.language, code: f.code });

  const lookup = (ref: string) => {
    const clean = ref.split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
    return byName.get(clean) ?? byName.get(clean.split('/').pop() ?? '') ?? null;
  };

  let out = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;
    const m = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!m) return tag;
    const hit = lookup(m[1]);
    if (hit && hit.language === 'css') return `<style>${hit.code}</style>`;
    return tag;
  });

  out = out.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi, (tag, src: string) => {
    const hit = lookup(src);
    if (hit && hit.language === 'javascript') return `<script>${hit.code}</script>`;
    return tag;
  });

  return out;
}

const baseOf = (name: string): string => name.split('/').pop()?.replace(/\.\w+$/, '').toLowerCase() ?? '';

/** اختيار ملف HTML المناسب لمعاينة كود CSS: الملف المرتبط بالاسم أولاً، ثم index.html، ثم أول ملف HTML. */
function pickHtmlForCss(cssName: string, files: { name: string; language: string; code: string }[]): { name: string; language: string; code: string } | null {
  const htmlFiles = files.filter((f) => f.language === 'html');
  if (htmlFiles.length === 0) return null;
  const cssBase = baseOf(cssName);
  const linked = htmlFiles.find((f) => {
    const linkTags = [...f.code.matchAll(/<link\b[^>]*>/gi)];
    return linkTags.some((tag) => {
      const t = tag[0];
      if (!/\brel=["']stylesheet["']/i.test(t)) return false;
      const href = t.match(/\bhref=["']([^"']+)["']/i);
      return href ? baseOf(href[1]) === cssBase : false;
    });
  });
  if (linked) return linked;
  const index = htmlFiles.find((f) => baseOf(f.name) === 'index');
  return index ?? htmlFiles[0];
}

const cssPreviewHtml = (css: string) => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${css}
</style>
</head>
<body>
<h1>عنوان تجريبي</h1>
<p>هذه فقرة تجريبية لمعاينة أكواد CSS. عدّل الألوان والخطوط والمسافات وشاهد النتيجة مباشرة.</p>
<button>زر تجريبي</button>
<ul>
  <li>العنصر الأول</li>
  <li>العنصر الثاني</li>
  <li>العنصر الثالث</li>
</ul>
</body>
</html>`;

export default function CodeLab() {
  const { t, lang } = useLang();
  const [files, setFiles] = useState<{ id: number; name: string; language: string; updatedAt: number }[]>([]);
  const [current, setCurrent] = useState<CodeFile | null>(null);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef('');
  const currentIdRef = useRef<number | null>(null);

  useEffect(() => {
    currentIdRef.current = current?.id ?? null;
  }, [current]);

  // مسودة محلية فورية — تُكتب مع كل تغيير وتُمسح عند الحفظ في السيرفر
  useEffect(() => {
    const cid = currentIdRef.current;
    if (cid === null) return;
    setCodeDraft(cid, code);
  }, [code]);

  const loadFiles = useCallback(async () => {
    try {
      const d = await api<{ files: { id: number; name: string; language: string; updatedAt: number }[] }>('/api/code');
      setFiles(d.files);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!current) return;
    if (code === lastSaved.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const d = await api<{ file: CodeFile }>(`/api/code/${current.id}`, {
          method: 'PUT',
          body: JSON.stringify({ code }),
        });
        lastSaved.current = code;
        clearCodeDraft(current.id);
        setFiles((prev) => prev.map((f) => (f.id === current.id ? { ...f, updatedAt: d.file.updatedAt } : f)));
        setCurrent((prev) => (prev && prev.id === current.id ? { ...prev, versions: d.file.versions, updatedAt: d.file.updatedAt } : prev));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [code, current]);

  const selectFile = async (id: number) => {
    setError('');
    try {
      const d = await api<{ file: CodeFile }>(`/api/code/${id}`);
      const localDraft = getCodeDraft(id);
      setCurrent(d.file);
      setCode(localDraft ?? d.file.code);
      lastSaved.current = d.file.code;
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createFile = async () => {
    setError('');
    try {
      const d = await api<{ file: CodeFile }>('/api/code', {
        method: 'POST',
        body: JSON.stringify({ name: newName || t('code.fileName'), language: 'javascript', code: '' }),
      });
      setNewName('');
      setCreating(false);
      await loadFiles();
      setCurrent(d.file);
      setCode('');
      lastSaved.current = '';
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteFile = async (id: number) => {
    if (!window.confirm(t('code.deleteConfirm'))) return;
    try {
      await api(`/api/code/${id}`, { method: 'DELETE' });
      clearCodeDraft(id);
      if (current?.id === id) {
        setCurrent(null);
        setCode('');
      }
      await loadFiles();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const changeMeta = async (patch: { name?: string; language?: string }) => {
    if (!current) return;
    try {
      const d = await api<{ file: CodeFile }>(`/api/code/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setCurrent(d.file);
      await loadFiles();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const restoreVersion = async (v: { at: number; code: string }) => {
    if (!current) return;
    if (!window.confirm(t('code.restoreConfirm'))) return;
    setCode(v.code);
    lastSaved.current = v.code;
    try {
      const d = await api<{ file: CodeFile }>(`/api/code/${current.id}`, {
        method: 'PUT',
        body: JSON.stringify({ code: v.code }),
      });
      setCurrent(d.file);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const langLabel = (l: string) => (t(`code.${l}`) as string) || l;

  const runCode = async () => {
    if (!current) return;
    setRunning(true);
    setError('');
    setPreview(null);
    setOutput('');
    try {
      if (current.language === 'html' || current.language === 'css') {
        const fetched = await Promise.all(
          files.map(async (f) => {
            try {
              const d = await api<{ file: CodeFile }>(`/api/code/${f.id}`);
              return d.file;
            } catch {
              return null;
            }
          })
        );
        const allFiles = fetched.filter((f): f is CodeFile => f !== null);
        // نستخدم الكود الحي الحالي للملف الشغّال بدل النسخة المحفوظة فقط
        const refs = allFiles.map((f) => (f.id === current.id ? { ...f, code } : f));
        if (current.language === 'html') {
          setPreview(resolveLocalRefs(code, refs));
        } else {
          const htmlFile = pickHtmlForCss(current.name, refs);
          setPreview(resolveLocalRefs(htmlFile ? htmlFile.code : cssPreviewHtml(code), refs));
        }
      } else if (current.language === 'python') {
        setOutput(t('code.pythonNotSupported'));
      } else {
        setOutput(await runJavaScript(code));
      }
    } catch (e) {
      setOutput('❌ ' + (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">💻 {t('code.title')}</h1>
          <p className="mt-1 text-sm text-gray-400">{t('code.savedLocally')}</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-fire rounded-xl px-5 py-2.5 font-bold text-white">
          + {t('code.newFile')}
        </button>
      </motion.div>

      {error && <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* قائمة الملفات */}
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="card-fire rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-400">{t('code.title')}</h2>
          {creating && (
            <div className="mb-3 space-y-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFile()}
                className="input-fire w-full rounded-lg px-3 py-2 text-sm"
                placeholder={t('code.fileName')}
              />
              <div className="flex gap-2">
                <button onClick={createFile} className="btn-fire flex-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white">
                  {t('common.add')}
                </button>
                <button onClick={() => setCreating(false)} className="btn-ghost-fire flex-1 rounded-lg px-3 py-1.5 text-xs font-bold">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-gray-500">{t('common.loading')}</p>
          ) : files.length === 0 ? (
            <p className="rounded-xl bg-ink-900 p-4 text-sm text-gray-500">{t('code.noFiles')}</p>
          ) : (
            <div className="space-y-1.5">
              {files.map((f) => (
                <div
                  key={f.id}
                  onClick={() => selectFile(f.id)}
                  className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                    current?.id === f.id ? 'bg-fire-500/15 text-fire-300' : 'bg-ink-900 hover:bg-ink-800 text-gray-300'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{f.name}</div>
                    <div className="text-xs text-gray-500">{langLabel(f.language)}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFile(f.id);
                    }}
                    className="ml-2 rounded-md p-1 text-gray-500 opacity-0 transition-opacity hover:text-fire-400 group-hover:opacity-100"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* المحرر */}
        <div className="space-y-3">
          {current ? (
            <>
              <div className="card-fire flex flex-wrap items-center gap-3 rounded-2xl p-4">
                <button
                  onClick={runCode}
                  disabled={running}
                  className="btn-fire rounded-lg px-5 py-2 font-bold text-white disabled:opacity-60"
                >
                  ▶ {running ? t('code.running') : t('code.run')}
                </button>
                <input
                  value={current.name}
                  onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                  onBlur={() => changeMeta({ name: current.name })}
                  className="input-fire min-w-40 flex-1 rounded-lg px-3 py-2 text-sm font-bold"
                />
                <select
                  value={current.language}
                  onChange={(e) => changeMeta({ language: e.target.value })}
                  className="input-fire rounded-lg px-3 py-2 text-sm font-bold"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {langLabel(l)}
                    </option>
                  ))}
                </select>
                <button onClick={() => setShowVersions(!showVersions)} className="btn-ghost-fire rounded-lg px-4 py-2 text-sm font-bold">
                  🕑 {t('code.versions')} ({current.versions?.length ?? 0})
                </button>
                <span className={`text-xs font-bold ${saved ? 'text-emerald-400' : 'text-gray-600'}`}>{saved ? `✓ ${t('code.saved')}` : '💾'}</span>
              </div>

              <CodeEditor value={code} onChange={setCode} language={current.language} height="60vh" />

              <div className="card-fire rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-gray-400">
                    {preview !== null ? '🖼 ' + t('code.preview') : '📤 ' + t('code.output')}
                  </h3>
                  {running && <span className="text-xs font-bold text-fire-300">{t('code.running')}</span>}
                </div>
                {preview !== null ? (
                  <iframe
                    sandbox="allow-scripts allow-modals allow-forms allow-popups"
                    srcDoc={preview}
                    title="preview"
                    className="h-64 w-full rounded-xl border border-ink-600 bg-white"
                  />
                ) : (
                <pre
                  dir="ltr"
                  className="min-h-28 whitespace-pre-wrap rounded-xl border border-ink-600 bg-ink-900 p-4 font-mono text-sm leading-6 text-gray-200"
                  style={{ textAlign: 'left' }}
                >
                  {output || t('code.outputEmpty')}
                </pre>
                )}
              </div>
              <p className="text-xs text-gray-500">{t('code.linkHint')}</p>


              {showVersions && (
                <div className="card-fire rounded-2xl p-4">
                  <h3 className="mb-3 text-sm font-bold text-gray-400">{t('code.versions')}</h3>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {[...(current.versions ?? [])].reverse().map((v, i) => (
                      <div key={v.at} className="flex items-center justify-between gap-3 rounded-lg bg-ink-900 px-3 py-2">
                        <span className="text-xs text-gray-400">
                          #{current.versions!.length - i} · {new Date(v.at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </span>
                        <button onClick={() => restoreVersion(v)} className="rounded-lg bg-fire-500/15 px-3 py-1 text-xs font-bold text-fire-300 hover:bg-fire-500/25">
                          {t('code.restore')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card-fire flex min-h-80 flex-col items-center justify-center rounded-2xl p-8 text-center">
              <div className="mb-3 text-5xl">💻</div>
              <p className="text-gray-400">{t('code.noFiles')}</p>
              <button onClick={() => setCreating(true)} className="btn-fire mt-4 rounded-xl px-5 py-2.5 font-bold text-white">
                + {t('code.newFile')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
