/**
 * تشغيل Python في المتصفح داخل Web Worker معزول.
 *
 * لماذا Web Worker؟
 * - كان Pyodide يعمل على الـ main thread، فأي `while True:` يجمّد التاب بالكامل
 *   ولا تعمل مهلة الـ setTimeout إطلاقاً (الحدث لا يصل أبداً).
 * - الآن الـ Worker يمتلك الخيط لنفسه، والـ main thread يظل متجاوباً ويستطيع
 *   `terminate()` بعد المهلة — فتُقتل الحلقات اللانهائية فعلياً.
 *
 * التهيئة مرة واحدة: تحميل 10MB (wasm) يستغرق ثواني على أول تشغيل فقط. بعدها
 * يُعاد استخدام نفس الـ Worker لكل عمليات التشغيل. إن قُتل (مهلة/خطأ) ننشئ
 * واحداً جديداً تلقائياً.
 *
 * الأصول مستضافة ذاتياً من `/pyodide/` (تُنسخ وقت البناء من node_modules)
 * بدل CDN خارجي: نفس الأصل، أسرع في مصر، ويعمل مع كاش الـ PWA.
 */

const PYODIDE_BASE = '/pyodide/';

/** مهلة أول تحميل (10MB على شبكة بطيئة). */
const INIT_TIMEOUT_MS = 90_000;

/** مهلة تنفيذ الكود بعد جهوزية المحرك. */
const RUN_TIMEOUT_MS = 5_000;

export const PYTHON_TIMEOUT_MESSAGE =
  '❌ انتهت مهلة التنفيذ (5 ثوانٍ) — تحقق من وجود حلقة لا نهائية';

const PYTHON_INIT_ERROR_MESSAGE =
  '❌ تعذّر تجهيز محرك Python. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.';

/**
 * كود الـ Worker. سلسلة نصية (لا ملف منفصل) ليعمل مع بناء Vite بلا أي إعداد،
 * ويُحمَّل من Blob بنفس أصل الصفحة.
 */
const WORKER_SOURCE = String.raw`
self.onmessage = async function (event) {
  var msg = event.data || {};

  if (msg.type === 'init') {
    try {
      importScripts(msg.base + 'pyodide.js');
      self.__pyodide = await loadPyodide({ indexURL: msg.base });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'init-error',
        message: (err && err.message) ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === 'run') {
    var py = self.__pyodide;
    if (!py) {
      self.postMessage({ type: 'done', id: msg.id, output: '❌ محرك Python غير جاهز' });
      return;
    }
    var out = '';
    try {
      var push = function (text) {
        if (!text) return;
        out += text;
        // Pyodide يمرّر كل سطر بدون محرف السطر الجديد — نضيفه كي تظهر الأسطر منفصلة.
        if (!/\n$/.test(text)) out += '\n';
      };
      py.setStdout({ batched: push });
      py.setStderr({ batched: push });
      var result = await py.runPythonAsync(msg.code);
      var res = '';
      if (result !== undefined && result !== null) {
        res = String(result);
        if (result && typeof result.destroy === 'function') {
          try { result.destroy(); } catch (_) {}
        }
      }
      var text = (out + (res ? (out ? '' : '') + res : '')).replace(/\n+$/, '');
      self.postMessage({ type: 'done', id: msg.id, output: text || '✓' });
    } catch (err) {
      var message = (err && err.message) ? err.message : String(err);
      self.postMessage({ type: 'done', id: msg.id, output: '❌ ' + message });
    }
  }
};
`;

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let isReady = false;
let runSeq = 0;

function absoluteBase(): string {
  try {
    return new URL(PYODIDE_BASE, `${window.location.origin}/`).href;
  } catch {
    return PYODIDE_BASE;
  }
}

/** يُسقط الـ Worker الحالي (بعد مهلة/خطأ) حتى يُعاد إنشاؤه في التشغيل التالي. */
function resetWorker(): void {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
  }
  worker = null;
  readyPromise = null;
  isReady = false;
}

/** ينشئ الـ Worker ويحمّل Pyodide. نتيجة الـ promise تُحفظ فلا يتكرر التحميل. */
function ensureWorker(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let blobUrl = '';
    let initTimer: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      if (initTimer) clearTimeout(initTimer);
      resetWorker();
      reject(new Error(message));
    };

    let w: Worker;
    try {
      blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      w = new Worker(blobUrl);
    } catch {
      fail('worker-unavailable');
      return;
    } finally {
      // يمكن تحرير الرابط فور إنشاء الـ Worker (لن يُطلب ثانية).
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }

    worker = w;

    initTimer = setTimeout(() => fail('timeout'), INIT_TIMEOUT_MS);

    w.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (!data || settled) return;
      if (data.type === 'ready') {
        settled = true;
        clearTimeout(initTimer);
        w.onmessage = null;
        isReady = true;
        resolve();
      } else if (data.type === 'init-error') {
        fail((data as { message?: string }).message ?? 'init-error');
      }
    };

    w.onerror = () => fail('init-error');

    w.postMessage({ type: 'init', base: absoluteBase() });
  });

  // فشل التهيئة لا يجب أن يُبقي promise مرفوضاً محفوظاً للأبد.
  readyPromise.catch(() => {
    readyPromise = null;
  });

  return readyPromise;
}

/** هل المحرك جاهز الآن (يُستخدم لعرض تلميح التحميل الأول فقط)؟ */
export function isPythonReady(): boolean {
  return isReady;
}

/** يُجهّز المحرك مسبقاً (اختياري) — يُستدعى عند فتح محرر Python. */
export function warmUpPython(): void {
  void ensureWorker().catch(() => {
    /* يُعاد المحاولة عند أول تشغيل فعلي */
  });
}

/**
 * ينفّذ كود Python ويعيد الناتج نصياً. لا يرمي أبداً — الأخطاء تُعاد داخل النص
 * حتى تُعرض في لوحة الناتج بنفس أسلوب JavaScript.
 * يعيد كائناً يحتوي على output و errorLine (اختياري) لتظليل السطر في المحرر.
 */
export async function runPython(code: string): Promise<{ output: string; errorLine?: number }> {
  try {
    await ensureWorker();
  } catch {
    return { output: PYTHON_INIT_ERROR_MESSAGE };
  }

  const w = worker;
  if (!w) return { output: PYTHON_INIT_ERROR_MESSAGE };

  const id = ++runSeq;

  return new Promise<{ output: string; errorLine?: number }>((resolve) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };

    const finish = (result: { output: string; errorLine?: number }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: number; output?: string } | null;
      if (!data || data.type !== 'done' || data.id !== id) return;

      const output = typeof data.output === 'string' ? data.output : '✓';

      // Parse traceback to extract error line
      let errorLine: number | undefined;
      if (output.startsWith('❌ ') && output.includes('line ')) {
        const match = output.match(/line (\d+)/);
        if (match) errorLine = parseInt(match[1], 10) - 1; // Convert to 0-indexed
      }

      finish({ output, errorLine });
    };

    const onError = (event: ErrorEvent) => {
      // خطأ غير متوقع في الـ Worker نفسه — نُسقطه ونكمل بمحرك جديد لاحقاً.
      resetWorker();
      finish({ output: '❌ ' + (event.message || 'خطأ في محرك Python') });
    };

    // المهلة هنا هي التي تُنهي الحلقات اللانهائية: نقتل الـ Worker بالكامل.
    const timer = setTimeout(() => {
      resetWorker();
      finish({ output: PYTHON_TIMEOUT_MESSAGE });
    }, RUN_TIMEOUT_MS);

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ type: 'run', id, code });
  });
}
