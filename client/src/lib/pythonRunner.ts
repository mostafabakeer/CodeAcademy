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
 *
 * لماذا ننزّل الأصول بأنفسنا قبل loadPyodide؟
 * كان Pyodide يبتلع فشل تنزيل `python_stdlib.zip` (يطبع تحذيراً فقط في الكونسول
 * ويكمل)، ثم يفشل إقلاع Python برسالة غامضة:
 *   Program terminated with exit(1)
 * وهذا بالضبط ما كان يراه الطالب على شبكة الموبايل البطيئة: انقطاع في منتصف
 * التنزيل ⇒ رسالة لا تقول شيئاً ولا حلّ فيها. الآن ننزّل الملف بأنفسنا بمحاولات
 * متعددة، ونتحقق من ترويسته، ونمرّره إلى Pyodide كـ Blob جاهز — فإن فشل التنزيل
 * تظهر رسالة مفهومة بدل exit(1). وننزّل الـ wasm أيضاً لتدفئة الكاش مع إعادة
 * المحاولة (فشل تنزيله كان يُنتج تعليقاً صامتاً حتى مهلة الـ 120 ثانية).
 */

/** يجب أن يطابق هذا الثابت EXPECTED_VERSION في client/scripts/copy-pyodide.mjs */
const PYODIDE_VERSION = '0.26.4';

const PYODIDE_BASE = `/py-engine/${PYODIDE_VERSION}/`;
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`;

/** مهلة كل محاولة تحميل — 10MB على شبكة موبايل بطيئة قد تحتاج أكثر من دقيقة. */
const INIT_TIMEOUT_MS = 120_000;

/**
 * سقف زمني لكل المحاولات معاً. بدونه قد ينتظر الطالب دقائق على شبكة ميتة
 * قبل أن يرى أي رسالة. (المهل داخل المحاولة «مهلة خمول»: ما دام الملف ينزل
 * فعلاً نتركه يكمل — الشبكة هنا بطيئة لكنها تتحرك.)
 */
const INIT_DEADLINE_MS = 300_000;

/** مهلة تنفيذ الكود بعد جهوزية المحرك. */
const RUN_TIMEOUT_MS = 5_000;

export const PYTHON_TIMEOUT_MESSAGE =
  '❌ انتهت مهلة التنفيذ (5 ثوانٍ) — تحقق من وجود حلقة لا نهائية';

const PYTHON_INIT_ERROR_TITLE = '❌ تعذّر تجهيز محرك Python.';

const PYTHON_INIT_ERROR_HINT =
  'أعد المحاولة مرة أخرى، وإن تكرر الخطأ فتحقّق من الاتصال بالإنترنت.';

/** مرحلة التحميل الجارية — تُستخدم لعرض نسبة تقدّم حقيقية للطالب. */
export type PythonInitPhase = 'wasm' | 'stdlib';

export type PythonInitProgress = {
  phase: PythonInitPhase;
  /** نسبة 0–100 لكل الملفات (وليست للملف الحالي)، أو null إن كان الحجم مجهولاً. */
  percent: number | null;
};

/**
 * كود الـ Worker. سلسلة نصية (لا ملف منفصل) ليعمل مع بناء Vite بلا أي إعداد،
 * ويُحمَّل من Blob بنفس أصل الصفحة.
 */
const WORKER_SOURCE = String.raw`
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function reportProgress(phase, loaded, total) {
  self.postMessage({ type: 'progress', phase: phase, loaded: loaded || 0, total: total || 0 });
}

/**
 * ينزّل ملفاً بمحاولات متعددة، ويتحقق من أول 4 بايتات قبل تمريره لـ Pyodide.
 * reload=true يتجاوز كاش المتصفح (يُستخدم بعد مسح كاش المحرك).
 */
async function download(url, kind, reload) {
  var attempts = 3;
  var last = null;

  for (var i = 0; i < attempts; i++) {
    try {
      var res = await fetch(url, reload ? { cache: 'reload' } : undefined);
      if (!res.ok) {
        var httpError = new Error('HTTP ' + res.status + (res.status === 404 ? ' (ملف مفقود)' : ''));
        // 4xx ليس عابراً: إعادة المحاولة لن تُغيّر النتيجة.
        httpError.fatal = res.status >= 400 && res.status < 500;
        throw httpError;
      }

      var total = Number(res.headers.get('content-length') || 0);
      var buf;

      if (res.body && res.body.getReader && total > 0) {
        // قراءة تدريجية: تُبلّغ عن التقدّم، وتكشف انقطاع الاتصال فوراً.
        var reader = res.body.getReader();
        var chunks = [];
        var loaded = 0;
        for (;;) {
          var step = await reader.read();
          if (step.done) break;
          chunks.push(step.value);
          loaded += step.value.length;
          reportProgress(kind, loaded, total);
        }
        var joined = new Uint8Array(loaded);
        var offset = 0;
        for (var c = 0; c < chunks.length; c++) {
          joined.set(chunks[c], offset);
          offset += chunks[c].length;
        }
        buf = joined.buffer;
      } else {
        buf = await res.arrayBuffer();
      }

      // الحجم والترويسة: الملف الناقص/صفحة خطأ HTML لا تُمرَّر أبداً.
      if (!buf || buf.byteLength < 1024) throw new Error('الملف ناقص أو فارغ');
      var head = new Uint8Array(buf, 0, 4);
      if (kind === 'stdlib' && !(head[0] === 0x50 && head[1] === 0x4b)) {
        throw new Error('ملف مكتبة Python غير صالح');
      }
      if (kind === 'wasm' && !(head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d)) {
        throw new Error('ملف المحرك غير صالح');
      }

      return buf;
    } catch (e) {
      last = e;
      if (e && e.fatal) throw e;
      if (i < attempts - 1) await sleep(700 * (i + 1));
    }
  }

  throw new Error(
    (kind === 'stdlib' ? 'تعذّر تنزيل مكتبة Python' : 'تعذّر تنزيل ملف المحرك') +
      ': ' + ((last && last.message) ? last.message : String(last)),
  );
}

self.onmessage = async function (event) {
  var msg = event.data || {};

  if (msg.type === 'init') {
    var stdlibUrl = '';
    try {
      // إن فشل instantiateStreaming (ترويسة content-type خاطئة مثلاً) نكمل
      // بالمسار العادي بدل التعليق الصامت حتى المهلة.
      try {
        var streaming = WebAssembly.instantiateStreaming;
        if (typeof streaming === 'function') {
          WebAssembly.instantiateStreaming = function (source, imports) {
            // نُنسخ الرد قبل استهلاكه حتى نستطيع إعادة المحاولة من الذاكرة.
            var copy = null;
            try {
              if (source && typeof source.clone === 'function') copy = source.clone();
            } catch (_) {
              copy = null;
            }
            return streaming.call(WebAssembly, source, imports).catch(function (err) {
              if (!copy) throw err;
              console.warn('[python] streaming instantiate failed, retrying:', err && err.message);
              return copy.arrayBuffer().then(function (buffer) {
                return WebAssembly.instantiate(buffer, imports);
              });
            });
          };
        }
      } catch (_) {}

      importScripts(msg.base + 'pyodide.js');

      // 1) الـ wasm: ننزّله هنا لتدفئة الكاش وإعادة المحاولة عند الانقطاع.
      await download(msg.base + 'pyodide.asm.wasm', 'wasm', msg.reload);

      // 2) المكتبة القياسية: نتحقق منها ثم نمرّرها كـ Blob حتى لا يبتلع
      //    Pyodide فشل تنزيلها ويكمل إلى exit(1) الغامض.
      var stdlib = await download(msg.base + 'python_stdlib.zip', 'stdlib', msg.reload);
      stdlibUrl = URL.createObjectURL(new Blob([stdlib], { type: 'application/zip' }));
      stdlib = null;

      self.__pyodide = await loadPyodide({ indexURL: msg.base, stdLibURL: stdlibUrl });
      self.postMessage({ type: 'ready', base: msg.base });
    } catch (err) {
      var name = (err && err.name) ? String(err.name) : '';
      var message = (err && err.message) ? String(err.message) : String(err);
      self.postMessage({
        type: 'init-error',
        message: name && name !== 'Error' ? name + ': ' + message : message,
      });
    } finally {
      if (stdlibUrl) { try { URL.revokeObjectURL(stdlibUrl); } catch (_) {} }
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
      var message2 = (err && err.message) ? err.message : String(err);
      self.postMessage({ type: 'done', id: msg.id, output: '❌ ' + message2 });
    }
  }
};
`;

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let isReady = false;
let runSeq = 0;

/** وزن كل ملف في شريط التقدّم — الـ wasm أكبر ملفات المحرك. */
const PHASE_RANGE: Record<PythonInitPhase, [number, number]> = {
  wasm: [0, 80],
  stdlib: [80, 100],
};

const progressListeners = new Set<(progress: PythonInitProgress) => void>();

/**
 * الاشتراك في تقدّم تنزيل المحرك (لأول تشغيل فقط).
 * يعيد دالة إلغاء الاشتراك.
 */
export function onPythonInitProgress(listener: (progress: PythonInitProgress) => void): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitProgress(progress: PythonInitProgress): void {
  progressListeners.forEach((listener) => {
    try {
      listener(progress);
    } catch {
      /* مستمع معطوب لا يجب أن يوقف التحميل */
    }
  });
}

/** المسار المطلق لأصول المحرك على نفس الأصل (أسرع ويعمل أوفلاين). */
function sameOriginBase(): string {
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

/**
 * يمسح كاش المحرك في Service Worker.
 *
 * Workbox كان يخزّن أي رد — بما فيه 404 — تحت `dr-pyodide` لمدة 30 يوماً، فصار
 * الخطأ عالقاً في متصفح الطالب ولا يُصلحه أي نشر جديد. المسح هنا يجعل المحاولة
 * الثانية تنزّل الملفات من الشبكة فعلياً.
 */
async function clearEngineCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    await caches.delete('dr-pyodide');
  } catch {
    /* لا كاش متاح (متصفح قديم/سياق خاص) — لا مشكلة */
  }
}

/** يحاول تهيئة Pyodide من مصدر واحد داخل Worker جديد. */
function tryInitFrom(base: string, reload: boolean): Promise<void> {
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
      const data = event.data as
        | { type?: string; message?: string; phase?: string; loaded?: number; total?: number }
        | null;
      if (!data || settled) return;

      if (data.type === 'progress') {
        // كل تقدّم حقيقي يُجدّد المهلة: الشبكة البطيئة التي تنزل فعلاً يجب ألا
        // تُقطع، بينما الاتصال الميت يُنهي المحاولة بعد 120 ثانية بلا تقدّم.
        if (timer) {
          clearTimeout(timer);
          timer = setTimeout(() => fail('انتهت مهلة تحميل المحرك'), INIT_TIMEOUT_MS);
        }
        const phase: PythonInitPhase = data.phase === 'stdlib' ? 'stdlib' : 'wasm';
        const [from, to] = PHASE_RANGE[phase];
        const total = data.total ?? 0;
        const loaded = data.loaded ?? 0;
        emitProgress({
          phase,
          percent: total > 0 ? Math.min(to, Math.round(from + (loaded / total) * (to - from))) : null,
        });
        return;
      }

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

    w.postMessage({ type: 'init', base, reload });
  });
}

type FailureKind = 'cache' | 'network' | 'device';

/**
 * تصنيف سبب فشل المحاولة — يحدّد شكل المحاولة التالية.
 * - `cache`: رد قديم/ناقص مخزَّن ⇒ امسح الكاش وأعد التنزيل.
 * - `network`: انقطاع/مهلة ⇒ أعد المحاولة بالكاش (لا تُهدر 10MB نزلت فعلاً).
 * - `device`: بايثون نفسه لم يقلع (ذاكرة/متصفح) ⇒ لا فائدة من التكرار، انتقل للـ CDN.
 */
function classifyFailure(message: string): FailureKind {
  if (/HTTP 4\d\d|غير صالح|الملف ناقص/i.test(message)) return 'cache';
  if (/Failed to fetch|NetworkError|importScripts|انتهت مهلة|تجاوزنا الوقت/i.test(message)) {
    return 'network';
  }
  return 'device';
}

/**
 * ينشئ الـ Worker ويحمّل Pyodide.
 *
 * الترتيب: نفس الأصل ⇒ (إعادة محاولة مناسبة لسبب الفشل) ⇒ CDN.
 * إعادة المحاولة هي التي تُخرج المتصفحات التي علِق فيها رد قديم (404/ملف ناقص)
 * من الحلقة المسدودة، وكانت تحتاج قبل ذلك مسح بيانات الموقع يدوياً.
 */
function ensureWorker(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const errors: string[] = [];
    const same = sameOriginBase();
    const startedAt = Date.now();
    const withinDeadline = () => Date.now() - startedAt <= INIT_DEADLINE_MS;

    // 1) نفس الأصل — المسار الطبيعي والأسرع.
    let kind: FailureKind;
    try {
      await tryInitFrom(same, false);
      return;
    } catch (e) {
      const message = (e as Error).message;
      // tryInitFrom أنهى الـ Worker وأسقط المرجع بنفسه؛ لا نستدعي resetWorker
      // هنا لأنه كان سيُفرغ readyPromise أثناء تنفيذها.
      errors.push(`${same} → ${message}`);
      kind = classifyFailure(message);
    }

    // 2) إعادة محاولة على نفس الأصل، بشكل يتبع سبب الفشل.
    if (kind !== 'device' && withinDeadline()) {
      const reload = kind === 'cache';
      if (reload) await clearEngineCache();
      try {
        await tryInitFrom(same, reload);
        return;
      } catch (e) {
        errors.push(`${same} → ${(e as Error).message}`);
      }
    }

    // 3) الـ CDN كملاذ أخير.
    if (withinDeadline()) {
      try {
        await tryInitFrom(PYODIDE_CDN_BASE, false);
        return;
      } catch (e) {
        errors.push(`${PYODIDE_CDN_BASE} → ${(e as Error).message}`);
      }
    } else {
      errors.push('تجاوزنا الوقت المسموح لتحميل المحرك');
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

/** تلميح مناسب لكل نوع فشل — الرسالة العامة كانت تُخفي السبب الحقيقي. */
function hintFor(reason: string): string {
  if (/exit\(1\)/i.test(reason)) {
    return 'المحرك نزل لكن بايثون فشل في الإقلاع — غالباً انقطع التنزيل. أعد المحاولة والموقع في المقدمة (لا تخرج منه)، ولو تكرر أغلق التطبيق وافتحه من جديد.';
  }
  if (/HTTP 4\d\d/i.test(reason)) {
    return 'ملفات المحرك غير متاحة على الخادم الآن. أبلغ إدارة الموقع إن تكرر الخطأ.';
  }
  if (/importScripts|Failed to fetch|NetworkError/i.test(reason)) {
    return 'تعذّر الوصول إلى ملفات المحرك. تحقّق من الاتصال بالإنترنت ثم أعد المحاولة.';
  }
  if (/out of memory|memory allocation|OOM/i.test(reason)) {
    return 'ذاكرة الجهاز لا تكفي لتشغيل Python. أغلق التطبيقات والتبويبات الأخرى ثم أعد المحاولة.';
  }
  if (/انتهت مهلة|تجاوزنا الوقت/i.test(reason)) {
    return 'التنزيل لم يكتمل في الوقت المسموح. جرّب شبكة Wi-Fi أو أعد المحاولة والموقع في المقدمة.';
  }
  return PYTHON_INIT_ERROR_HINT;
}

function initErrorOutput(reason: string): string {
  // نعرض سبباً مختصراً قابلاً للقراءة بدل الرسالة العامة القديمة التي كانت
  // تُخفي الحقيقة (كانت تقول "تحقّق من اتصالك" حتى لو كان الخطأ 404).
  const detail = reason.replace(/\s+/g, ' ').trim().slice(0, 400);
  return `${PYTHON_INIT_ERROR_TITLE}\n${detail ? `السبب: ${detail}\n` : ''}${hintFor(reason)}`;
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
