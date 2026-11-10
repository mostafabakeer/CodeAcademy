import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import { api } from '../api/client';
import CodeEditor from '../components/CodeEditor';
import { getDB, getAllFiles, getFileById, saveFile, deleteFile, generateId, setLastOpenedFileId, getLastOpenedFileId } from '../lib/localFileSystem';
import { getCodeDraft, setCodeDraft, clearCodeDraft } from '../lib/localStore';
import { runPython, isPythonReady, warmUpPython } from '../lib/pythonRunner';

interface LocalFile {
  id: string;
  name: string;
  language: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

const LANGUAGES = ['javascript', 'python', 'html', 'css'] as const;
const WORKER_TIMEOUT_MS = 5000;

async function runJavaScript(code: string): Promise<string> {
  const workerSource = `
    self.onmessage = async (e) => {
      const code = e.data.code;
      const logs = [];
      const formatValue = (v) => {
        if (typeof v === 'string') return v;
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
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

  return new Promise((resolve) => {
    let worker = null;
    let blobUrl = null;
    let settled = false;
    const finish = (text) => {
      if (settled) return;
      settled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      try { worker?.terminate(); } catch {}
      resolve(text);
    };

    try {
      blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      worker = new Worker(blobUrl);
    } catch {
      finish('❌ تعذر تشغيل العامل — تحقق من دعم المتصفح');
      return;
    }

    const timer = setTimeout(
      () => finish('❌ انتهت مهلة التنفيذ (5 ثوانٍ) — تحقق من وجود حلقة لا نهائية'),
      WORKER_TIMEOUT_MS
    );
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
  // Build lookup map with multiple keys for flexible matching
  const byName = new Map<string, { language: string; code: string }>();
  for (const f of files) {
    const normalizedName = normalizePath(f.name);
    byName.set(normalizedName, f);
    // Also index by basename
    const base = normalizedName.split('/').pop();
    if (base && base !== normalizedName) byName.set(base, f);
  }

  const lookup = (ref: string) => {
    const clean = normalizePath(ref);
    return byName.get(clean) ?? byName.get(clean.split('/').pop() ?? '') ?? null;
  };

  // Normalize path for case-insensitive, relative path handling
  function normalizePath(path: string): string {
    return path
      .split('?')[0]
      .split('#')[0]
      .replace(/^\.\//, '')
      .replace(/^\/+/, '')
      .toLowerCase();
  }

  let out = html;

  // 1. Handle <link rel="stylesheet" href="..."> - inline CSS
  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;
    const m = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!m) return tag;
    const hit = lookup(m[1]);
    if (hit && hit.language === 'css') return `<style>${hit.code}</style>`;
    return tag;
  });

  // 2. Handle <script src="..."></script> - inline JS
  out = out.replace(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi,
    (tag, src: string) => {
      const hit = lookup(src);
      if (hit && hit.language === 'javascript') return `<script>${hit.code}</script>`;
      return tag;
    }
  );

  // 3. Handle @import in existing <style> tags
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (tag, cssContent) => {
    const processedCss = cssContent.replace(
      /@import\s+(?:url\()?["']([^"']+)["']\)?\s*;/gi,
      (importTag, importPath: string) => {
        const hit = lookup(importPath);
        if (hit && hit.language === 'css') return hit.code;
        return importTag; // Keep original if not found
      }
    );
    return `<style>${processedCss}</style>`;
  });

  // 4. Handle ES modules: <script type="module"> import ... from '...'
  out = out.replace(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi, (tag, jsContent) => {
    const processedJs = jsContent.replace(
      /import\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gi,
      (importTag, importPath: string) => {
        const hit = lookup(importPath);
        if (hit && hit.language === 'javascript') {
          // Replace the import with inline code (IIFE to avoid scope issues)
          return `(function(){${hit.code}})()`;
        }
        return importTag; // Keep original if not found (external CDN)
      }
    );
    return `<script type="module">${processedJs}</script>`;
  });

  return out;
}

const cssPreviewHtml = (css: string) => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${css}</style>
</head>
<body>
<h1>عنوان تجريبي</h1>
<p>هذه فقرة تجريبية لمعاينة أكواد CSS.</p>
<button>زر تجريبي</button>
<ul><li>العنصر الأول</li><li>العنصر الثاني</li></ul>
</body></html>`;

/**
 * Inject console capture script into HTML before it loads in iframe.
 * This ensures console.* calls are captured from the very beginning.
 */
function injectConsoleCapture(html: string): string {
  const consoleCaptureScript = `
<script>
(function() {
  // Buffer to store messages before parent is ready
  window.__consoleBuffer = [];
  window.__consoleReady = false;

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  function sendToParent(type, args) {
    const message = {
      type: 'console',
      payload: { type, args: args.map(formatArg) }
    };
    if (window.__consoleReady) {
      window.parent.postMessage(message, '*');
    } else {
      window.__consoleBuffer.push(message);
    }
  }

  function formatArg(arg) {
    if (typeof arg === 'string') return arg;
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    try {
      const json = JSON.stringify(arg, null, 2);
      return json === undefined ? String(arg) : json;
    } catch {
      return String(arg);
    }
  }

  console.log = function(...args) {
    sendToParent('log', args);
    originalLog.apply(console, args);
  };
  console.error = function(...args) {
    sendToParent('error', args);
    originalError.apply(console, args);
  };
  console.warn = function(...args) {
    sendToParent('warn', args);
    originalWarn.apply(console, args);
  };
  console.info = function(...args) {
    sendToParent('info', args);
    originalInfo.apply(console, args);
  };

  // Capture unhandled errors
  window.addEventListener('error', function(event) {
    sendToParent('error', ['Uncaught Error: ' + event.message]);
  });

  window.addEventListener('unhandledrejection', function(event) {
    sendToParent('error', ['Unhandled Promise Rejection: ' + String(event.reason)]);
  });

  // Notify parent when ready
  window.addEventListener('load', function() {
    window.__consoleReady = true;
    window.parent.postMessage({ type: 'console-ready' }, '*');
    // Flush buffer
    window.__consoleBuffer.forEach(function(msg) {
      window.parent.postMessage(msg, '*');
    });
    window.__consoleBuffer = [];
  });
})();
</script>
`;

  // Inject the script right after <head> or at the beginning of <body>
  if (html.includes('<head>')) {
    return html.replace('<head>', '<head>' + consoleCaptureScript);
  } else if (html.includes('<body>')) {
    return html.replace('<body>', consoleCaptureScript + '<body>');
  } else {
    // No head/body, prepend to document
    return consoleCaptureScript + html;
  }
}

export default function CodeLab() {
  const { t, lang } = useLang();
  const [files, setFiles] = useState<{ id: string; name: string; language: string; updatedAt: number }[]>([]);
  const [current, setCurrent] = useState<LocalFile | null>(null);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [fullPreview, setFullPreview] = useState<string | null>(null);
  const [fullPreviewType, setFullPreviewType] = useState<'html' | 'text'>('html');
  const [running, setRunning] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<{ type: 'log' | 'error' | 'warn' | 'info'; args: unknown[] }[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consoleMessagesRef = useRef(consoleMessages);
  consoleMessagesRef.current = consoleMessages;
  const runningRef = useRef(false);
  const fileCacheRef = useRef<Map<string, LocalFile>>(new Map());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedCodeRef = useRef<string>('');

  // Define runCode early to avoid temporal dead zone issues with useEffect dependencies
  const runCode = async () => {
    if (!current) return;
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setError('');
    setPreview(null);
    setOutput('');

    try {
      if (current.language === 'html' || current.language === 'css') {
        // Get all files from IndexedDB to ensure we have the latest saved versions
        const db = await getDB();
        const allFilesFromDB = await getAllFiles();

        // Merge with cache, preferring current editor code for current file
        const allFilesMap = new Map<string, LocalFile>();
        for (const f of allFilesFromDB) {
          allFilesMap.set(f.id, f);
        }
        // Override with cache (which has unsaved changes)
        for (const [id, f] of fileCacheRef.current.entries()) {
          allFilesMap.set(id, f);
        }
        // Use current editor code for current file
        if (current.id) {
          const existing = allFilesMap.get(current.id);
          if (existing) {
            allFilesMap.set(current.id, { ...existing, code });
          }
        }

        const allFiles = Array.from(allFilesMap.values());
        const refs = allFiles.map(f => ({ name: f.name, language: f.language, code: f.code }));

        let result: string;
        if (current.language === 'html') {
          result = resolveLocalRefs(code, refs);
        } else {
          const htmlFile = allFiles.find(f => f.language === 'html');
          result = resolveLocalRefs(
            htmlFile ? htmlFile.code : cssPreviewHtml(code),
            refs
          );
        }
        setPreview(result);
      } else if (current.language === 'python') {
        if (!isPythonReady()) setOutput(t('code.pythonLoading'));
        const pythonResult = await runPython(code);
        setOutput(pythonResult.output);
      } else {
        setOutput(await runJavaScript(code));
      }
    } catch (e) {
      setOutput('❌ ' + (e as Error).message);
    } finally {
      setRunning(false);
      runningRef.current = false;
    }
  };

  // تحميل الملفات عند الفتح
  useEffect(() => {
    loadFiles();
    warmUpPython();
  }, []);

  // حفظ المسودة محليًا عند كل تغيير (localStorage draft)
  useEffect(() => {
    if (!current?.id) return;
    setCodeDraft(current.id, code);
  }, [code]);

  // Auto-save to IndexedDB with debounce (1.5 seconds)
  useEffect(() => {
    if (!current?.id) return;
    // Only trigger auto-save if code actually changed since last save
    if (code === lastSavedCodeRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    // Don't set saved=false immediately - only when we actually save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveFile({ ...current, code, updatedAt: Date.now() });
        fileCacheRef.current.set(current.id, { ...current, code, updatedAt: Date.now() });
        lastSavedCodeRef.current = code;
        setSaved(true);
        // Don't call loadFiles() here - it causes unnecessary re-renders
        // The file list timestamp update isn't critical for auto-save
      } catch (e) {
        console.error('Auto-save failed:', e);
      }
    }, 1500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [code, current]);

  // Handle console messages from full preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'console-ready') {
        // Iframe is ready, we can now receive console messages
        return;
      }

      if (data.type === 'console' && data.payload) {
        const { type, args } = data.payload;
        if (['log', 'error', 'warn', 'info'].includes(type)) {
          consoleMessagesRef.current = [...consoleMessagesRef.current, { type: type as 'log' | 'error' | 'warn' | 'info', args }];
          setConsoleMessages(consoleMessagesRef.current);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Keyboard shortcuts: Ctrl+S to save, Ctrl+Enter to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Trigger auto-save immediately
        if (current?.id && code) {
          saveFile({ ...current, code, updatedAt: Date.now() }).then(() => {
            fileCacheRef.current.set(current.id, { ...current, code, updatedAt: Date.now() });
            setSaved(true);
            loadFiles();
          });
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, code, runCode]);

  const loadFiles = useCallback(async () => {
    try {
      const db = await getDB();
      const allFiles = await getAllFiles();
      setFiles(allFiles.map(f => ({ id: f.id, name: f.name, language: f.language, updatedAt: f.updatedAt })));

      // استعادة آخر ملف مفتوح
      const lastId = await getLastOpenedFileId();
      if (lastId) {
        const savedFile = allFiles.find(f => f.id === lastId);
        if (savedFile) selectFile(savedFile.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectFile = async (id: string) => {
    setError('');
    try {
      const db = await getDB();
      const file = await getFileById(id);
      if (!file) return;

      const localDraft = getCodeDraft(id);
      fileCacheRef.current.set(id, file);
      setCurrent(file);
      setCode(localDraft ?? file.code);
      await setLastOpenedFileId(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createFile = async () => {
    setError('');
    try {
      const id = await generateId();
      const newFile = {
        id,
        name: newName || t('code.fileName'),
        language: 'javascript',
        code: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveFile(newFile);
      setNewName('');
      setCreating(false);
      fileCacheRef.current.set(id, newFile);
      await loadFiles();
      setCurrent(newFile);
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteFile = async (id: string) => {
    if (!window.confirm(t('code.deleteConfirm'))) return;
    try {
      await deleteFile(id);
      fileCacheRef.current.delete(id);
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
      const updated = { ...current, ...patch, updatedAt: Date.now() };
      await saveFile(updated);
      fileCacheRef.current.set(current.id, updated);
      setCurrent(updated);
      await loadFiles();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openFullPreview = () => {
    if (preview !== null) {
      setFullPreview(preview);
      setFullPreviewType('html');
    } else if (output) {
      setFullPreview(output);
      setFullPreviewType('text');
    }
  };

  const langLabel = (l: string) => (t(`code.${l}`) as string) || l;

  return (
    <>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <h1 className="text-2xl font-black sm:text-3xl">💻 {t('code.title')}</h1>
            <p className="mt-1 text-sm text-gray-400">{t('code.savedLocally')}</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="btn-fire rounded-xl px-5 py-2.5 font-bold text-white"
          >
            + {t('code.newFile')}
          </button>
        </motion.div>

        {error && (
          <div className="rounded-xl border border-fire-500/40 bg-fire-950/40 px-4 py-3 text-sm text-fire-300">
            {error}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          {/* قائمة الملفات */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="card-fire rounded-2xl p-4"
          >
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
                  <button onClick={createFile} className="btn-fire flex-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white">{t('common.add')}</button>
                  <button onClick={() => setCreating(false)} className="btn-ghost-fire flex-1 rounded-lg px-3 py-1.5 text-xs font-bold">{t('common.cancel')}</button>
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
                      onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
                      aria-label={t('code.deleteFile')}
                      className="ml-2 rounded-md bg-ink-800/80 p-1.5 text-gray-400 transition-colors hover:text-fire-400 sm:bg-transparent sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* المحرر */}
          <div className="min-w-0 space-y-3">
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
                  {(preview !== null || output) && (
                    <button
                      onClick={openFullPreview}
                      className="btn-ghost-fire rounded-lg px-4 py-2 text-sm font-bold"
                    >
                      🔍 {t('code.fullPreview')}
                    </button>
                  )}
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
                      <option key={l} value={l}>{langLabel(l)}</option>
                    ))}
                  </select>
                  <span className={`text-xs font-bold ${saved ? 'text-emerald-400' : 'text-gray-600'}`}>
                    {saved ? `✓ ${t('code.saved')}` : '💾'}
                  </span>
                </div>
                <div className="card-fire rounded-2xl p-4">
                  <CodeEditor value={code} onChange={setCode} language={current.language} height="60vh" />
                </div>
                <div className="card-fire rounded-2xl p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-gray-400">
                      {output ? '📤 ' + t('code.output') : preview ? '🖼 ' + t('code.preview') : ''}
                    </h3>
                    {running && <span className="text-xs font-bold text-fire-300">{t('code.running')}</span>}
                  </div>
                  {preview !== null ? (
                    <iframe
                      sandbox="allow-scripts allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={injectConsoleCapture(preview)}
                      title="preview"
                      className="h-64 w-full rounded-xl border border-ink-600 bg-white"
                    />
                  ) : (
                    <pre
                      dir="ltr"
                      className="max-h-96 overflow-y-auto min-h-28 whitespace-pre-wrap rounded-xl border border-ink-600 bg-ink-900 p-4 font-mono text-sm leading-6 text-gray-200"
                      style={{ textAlign: 'left' }}
                    >
                      {output || t('code.outputEmpty')}
                    </pre>
                  )}
                </div>
                <p className="text-xs text-gray-500">{t('code.linkHint')}</p>
                <p className="text-xs text-gray-500 mt-1">⌘/Ctrl+S: حفظ  •  ⌘/Ctrl+Enter: تشغيل</p>
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
      {fullPreview !== null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
          <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-300">
              {t('code.fullPreview')}
            </h3>
            <div className="flex items-center gap-2">
              {fullPreviewType === 'html' && (
                <>
                  <button
                    onClick={() => setShowConsole(!showConsole)}
                    className={`btn-ghost-fire rounded-lg px-4 py-1.5 text-sm font-bold ${showConsole ? 'bg-fire-500/20' : ''}`}
                    title={t('code.console') || 'Console'}
                  >
                    🖥 {t('code.console') || 'Console'}
                    {consoleMessages.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-fire-500/20 text-fire-300 rounded-full">
                        {consoleMessages.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (iframeRef.current?.contentWindow) {
                        iframeRef.current.contentWindow.focus();
                        iframeRef.current.contentWindow.console.log('%c Console opened', 'color: #e11d31; font-size: 14px; font-weight: bold;');
                      }
                    }}
                    className="btn-ghost-fire rounded-lg px-4 py-1.5 text-sm font-bold"
                    title={t('code.focusIframe') || 'Focus iframe'}
                  >
                    🔍
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setFullPreview(null);
                  setConsoleMessages([]);
                  setShowConsole(false);
                }}
                className="rounded-lg bg-fire-500/15 px-4 py-1.5 text-sm font-bold text-fire-300 hover:bg-fire-500/25"
              >
                ✕ {t('common.close')}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {fullPreviewType === 'html' ? (
              <>
                <iframe
                  ref={iframeRef}
                  sandbox="allow-scripts allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={injectConsoleCapture(fullPreview)}
                  title="full preview"
                  className={`${showConsole ? 'h-[calc(100%-200px)]' : 'h-full'} w-full border-0 bg-white`}
                />
                {showConsole && consoleMessages.length > 0 && (
                  <div className="h-64 bg-ink-950 border-t border-ink-700 overflow-y-auto p-3 font-mono text-xs">
                    {consoleMessages.map((msg, i) => (
                      <div key={i} className={`mb-1 px-2 py-1 rounded ${msg.type === 'error' ? 'bg-red-500/10' : msg.type === 'warn' ? 'bg-yellow-500/10' : msg.type === 'info' ? 'bg-blue-500/10' : 'bg-green-500/10'}`}>
                        <span className={`font-bold ${msg.type === 'error' ? 'text-red-400' : msg.type === 'warn' ? 'text-yellow-400' : msg.type === 'info' ? 'text-blue-400' : 'text-green-400'}`}>
                          {msg.type.toUpperCase()}
                        </span>
                        <span className="ml-2 text-gray-300">
                          {msg.args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <pre
                dir="ltr"
                className="h-full overflow-y-auto bg-ink-900 p-6 font-mono text-base leading-7 text-gray-200"
                style={{ textAlign: 'left' }}
              >
                {fullPreview}
              </pre>
            )}
          </div>
        </div>
      )}
    </>
  );
}
