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
 * المصادر بالترتيب:
 * 1) نفس الأصل من `/py-engine/<version>/` (أسرع في مصر، ويعمل مع الكاش).
 * 2) CDN مثبّت الإصدار كاحتياطي — حتى لا تتعطّل ميزة Python كلها لو نقصت
 *    الأصول من حزمة النشر (وهو ما حدث فعلاً في نسخة سابقة).
 *
 * المسار يحمل رقم الإصدار لأن `_headers` يضع كاشاً طويلاً على `/py-engine/*`،
 * وردود 404 القديمة المخزَّنة في متصفحات الطلاب كانت ستُخفي الإصلاح.
 */

/** يجب أن يطابق هذا الثابت EXPECTED_VERSION في client/scripts/copy-pyodide.mjs */
const PYODIDE_VERSION = '0.26.4';

const PYODIDE_BASE = `/py-engine/${PYODIDE_VERSION}/`;
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`;

/** مهلة كل محاولة تحميل — 10MB على شبكة موبايل بطيئة قد تحتاج أكثر من دقيقة. */
const INIT_TIMEOUT_MS = 120_000;

/** مهلة تنفيذ الكود بعد جهوزية المحرك. */
const RUN_TIMEOUT_MS = 5_000;

export const PYTHON_TIMEOUT_MESSAGE =
  '❌ انتهت مهلة التنفيذ (5 ثوانٍ) — تحقق من وجود حلقة لا نهائية';

const PYTHON_INIT_ERROR_TITLE = '❌ تعذّر تجهيز محرك Python.';

const PYTHON_INIT_ERROR_HINT =
  'أعد المحاولة مرة أخرى، وإن تكرر الخطأ فتحقّق من الاتصال بالإنترنت.';

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
      self.postMessage({ type: 'ready', base: msg.base });
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

/** المسار المطلق لأصول المحرك على نفس الأصل (أسرع ويعمل أوفلاين). */
function sameOriginBase(): string {
  try {
    return new URL(PYODIDE_BASE, `${window.location.origin}/`).href;
  } catch {
    return PYODIDE_BASE;
  }
}

/**
 * ترتيب المصادر.
 *
 * نفس الأصل أولاً **دائماً** — بلا فحص HEAD مسبق. السبب: الفحص كان يحدث قبل
 * تحميل المحرك، وعلى شبكة بطيئة قد ينتهي بمهلة فيُرسل الطالب إلى jsDelivr
 * (وهو أبطأ/محجوب أحياناً في مصر) فيفشل التحميل كله رغم أن الأصول موجودة
 * على نفس الأصل. نجرّب نفس الأصل مباشرة؛ فإن فشل فعلاً ننتقل للـ CDN.
 */
function bases(): string[] {
  return [sameOriginBase(), PYODIDE_CDN_BASE];
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

/** يحاول تهيئة Pyodide من مصدر واحد داخل Worker جديد. */
function tryInitFrom(base: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let blobUrl = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      try {
        w.terminate();
      } catch {
        /* ignore */
      }
      if (worker === w) worker = null;
      reject(new Error(message));
    };

    let w: Worker;
    try {
      blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      w = new Worker(blobUrl);
    } catch {
      reject(new Error('المتصفح لا يدعم Web Worker'));
      return;
    }

    worker = w;
    timer = setTimeout(() => fail('انتهت مهلة تحميل المحرك'), INIT_TIMEOUT_MS);

    w.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; message?: string } | null;
      if (!data || settled) return;
      if (data.type === 'ready') {
        settled = true;
        if (timer) clearTimeout(timer);
        isReady = true;
        // لا نحذف w.onmessage: runPython يضيف مستمعاً خاصاً به عبر addEventListener.
        w.onmessage = null;
        // نُلغي عنوان الـ Blob بعد نجاح التحميل فقط: إلغاؤه فوراً بعد إنشاء
        // الـ Worker قد يجعله يفشل في المتصفحات التي تحمّل السكربت بشكل غير متزامن.
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        resolve();
      } else if (data.type === 'init-error') {
        fail(data.message ?? 'خطأ غير معروف أثناء تحميل المحرك');
      }
    };

    w.onerror = (event: ErrorEvent) => fail(event.message || 'تعذّر تحميل ملفات المحرك');

    w.postMessage({ type: 'init', base });
  });
}

/** ينشئ الـ Worker ويحمّل Pyodide، ويجرّب CDN لو فشل نفس الأصل. */
function ensureWorker(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const errors: string[] = [];
    for (const base of bases()) {
      try {
        await tryInitFrom(base);
        return;
      } catch (e) {
        // tryInitFrom أنهى الـ Worker وأسقط المرجع بنفسه؛ لا نستدعي resetWorker
        // هنا لأنه كان سيُفرغ readyPromise أثناء تنفيذها.
        errors.push(`${base} → ${(e as Error).message}`);
      }
    }
    throw new Error(errors.join('\n'));
  })();

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

function initErrorOutput(reason: string): string {
  // نعرض سبباً مختصراً قابلاً للقراءة بدل الرسالة العامة القديمة التي كانت
  // تُخفي الحقيقة (كانت تقول "تحقّق من اتصالك" حتى لو كان الخطأ 404).
  const detail = reason.replace(/\s+/g, ' ').trim().slice(0, 400);
  return `${PYTHON_INIT_ERROR_TITLE}\n${detail ? `السبب: ${detail}\n` : ''}${PYTHON_INIT_ERROR_HINT}`;
}

/**
 * ينفّذ كود Python ويعيد الناتج نصياً. لا يرمي أبداً — الأخطاء تُعاد داخل النص
 * حتى تُعرض في لوحة الناتج بنفس أسلوب JavaScript.
 * يعيد كائناً يحتوي على output و errorLine (اختياري) لتظليل السطر في المحرر.
 */
export async function runPython(code: string): Promise<{ output: string; errorLine?: number }> {
  try {
    await ensureWorker();
  } catch (e) {
    return { output: initErrorOutput((e as Error)?.message ?? '') };
  }

  const w = worker;
  if (!w) return { output: initErrorOutput('لم يُنشأ الـ Worker') };

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
