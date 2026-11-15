import { getLocal, removeLocal, setLocal } from './storage';

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
 * 3) إصدار أقدم من الـ CDN إذا فشل إقلاع الإصدار الأول على الجهاز نفسه
 *    (عيب Pyodide 0.26 على بعض أجهزة أندرويد — انظر ENGINES أدناه).
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

/**
 * محركات Python بالترتيب الذي نجرّبها به.
 *
 * لماذا أكثر من إصدار؟
 * Pyodide 0.26+ لا يقلع على بعض أجهزة أندرويد (سامسونج خصوصاً) وينتهي بـ
 * `exit(1)` داخل `init_fs_encoding` — عيب معروف في Pyodide لم يستطع مطوّروها
 * إعادة إنتاجه (pyodide#5280)، بينما 0.25 يقلع على نفس الأجهزة. فلا فائدة من
 * إعادة محاولة 0.26 على الجهاز نفسه؛ ننتقل مباشرة للإصدار الأقدم.
 *
 * الإصدار الأول مستضاف عندنا (أسرع في مصر + يعمل أوفلاين)، والثاني من الـ CDN
 * فقط حتى لا نضيف ~7.4MB لحزمة النشر بلا داعٍ.
 *
 * يجب أن يطابق الإصدار الأول EXPECTED_VERSION في client/scripts/copy-pyodide.mjs.
 */
const ENGINES: ReadonlyArray<{ version: string; selfHosted: boolean }> = [
  { version: '0.26.4', selfHosted: true },
  { version: '0.25.1', selfHosted: false },
];

/** الإصدار الذي نجح آخر مرة على هذا الجهاز — نتذكّره لئلا نعيد تنزيل الفاشل. */
const ENGINE_MEMORY_KEY = 'pyEngineVersion';

/** مهلة كل محاولة تحميل — 10MB على شبكة موبايل بطيئة قد تحتاج أكثر من دقيقة. */
const INIT_TIMEOUT_MS = 120_000;

/**
 * سقف زمني لكل المحاولات معاً. بدونه قد ينتظر الطالب دقائق على شبكة ميتة
 * قبل أن يرى أي رسالة. (المهل داخل المحاولة «مهلة خمول»: ما دام الملف ينزل
 * فعلاً نتركه يكمل — الشبكة هنا بطيئة لكنها تتحرك.)
 *
 * رُفع إلى 7 دقائق لأن مسار الاحتياط الكامل قد ينزّل محركين (12MB ثم 6MB) على
 * شبكة بطيئة؛ وقطع المحاولة قبل اكتمالها يُهدر ما نزل منها بالفعل.
 */
const INIT_DEADLINE_MS = 420_000;

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
  /** true إذا كنا نجرّب إصداراً أقدم بعد فشل الإصدار الأول على هذا الجهاز. */
  fallback: boolean;
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
    // آخر سطور ما كتبه Python/Emscripten قبل الفشل. رسالة exit(1) وحدها لا
    // تقول السبب؛ السطر الحقيقي (مثل init_fs_encoding) يُكتب في الكونسول.
    var captured = [];
    var capture = function (text) {
      if (!text) return;
      captured.push(String(text));
      if (captured.length > 40) captured.shift();
    };
    var consoleError = console.error;
    var consoleWarn = console.warn;
    var wrapConsole = function (original) {
      return function () {
        capture(Array.prototype.join.call(arguments, ' '));
        return original.apply(console, arguments);
      };
    };
    try {
      console.error = wrapConsole(consoleError);
      console.warn = wrapConsole(consoleWarn);
    } catch (_) {}

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

      self.__pyodide = await loadPyodide({
        indexURL: msg.base,
        stdLibURL: stdlibUrl,
        // حتى لو أفلتت منّا رسالة من مسار آخر، نحتفظ بها للرسالة النهائية.
        stdout: capture,
        stderr: capture,
      });
      self.postMessage({ type: 'ready', base: msg.base });
    } catch (err) {
      var name = (err && err.name) ? String(err.name) : '';
      var message = (err && err.message) ? String(err.message) : String(err);
      var tail = captured.join(' ').replace(/\s+/g, ' ').trim();
      if (tail) message += ' | ' + tail.slice(-320);
      self.postMessage({
        type: 'init-error',
        message: name && name !== 'Error' ? name + ': ' + message : message,
      });
    } finally {
      try {
        console.error = consoleError;
        console.warn = consoleWarn;
      } catch (_) {}
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
function sameOriginBase(version: string): string {
  const path = `/py-engine/${version}/`;
  try {
    return new URL(path, `${window.location.origin}/`).href;
  } catch {
    return path;
  }
}

/** أصول الإصدار نفسه من jsDelivr (احتياطي عند نقص أصول النشر). */
function cdnBase(version: string): string {
  return `https://cdn.jsdelivr.net/npm/pyodide@${version}/`;
}

/**
 * ترتيب المحركات لهذا الجهاز: الناجح سابقاً أولاً.
 *
 * بدون ذلك يعيد جهازٌ مصاب بعيب 0.26 تنزيل 12MB في كل زيارة ثم يفشل، قبل أن
 * يصل إلى 0.25 — كارثة على شبكة بطيئة. بعد أول نجاح نبدأ بالإصدار العامل.
 */
function preferredEngines(): ReadonlyArray<{ version: string; selfHosted: boolean }> {
  const remembered = getLocal(ENGINE_MEMORY_KEY);
  if (!remembered) return ENGINES;
  const first = ENGINES.filter((engine) => engine.version === remembered);
  if (first.length === 0) return ENGINES;
  return [...first, ...ENGINES.filter((engine) => engine.version !== remembered)];
}

function rememberEngine(version: string): void {
  setLocal(ENGINE_MEMORY_KEY, version);
}

function forgetEngine(version: string): void {
  if (getLocal(ENGINE_MEMORY_KEY) === version) removeLocal(ENGINE_MEMORY_KEY);
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
function tryInitFrom(base: string, reload: boolean, fallback = false): Promise<void> {
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
          fallback,
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
 * - `device`: بايثون نفسه لم يقلع (ذاكرة/متصفح) ⇒ لا فائدة من التكرار على
 *   الإصدار نفسه، انتقل للإصدار الأقدم من الـ CDN.
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
 * لكل إصدار: نفس الأصل (إن كان مستضافاً عندنا) ⇒ CDN.
 * وإذا فشل **إقلاع** Python نفسه (لا التنزيل) لا نُكرّر على الإصدار نفسه —
 * فالعيب في الإصدار مع هذا الجهاز — بل ننتقل للإصدار الأقدم فوراً. هذا يوفّر
 * ~12MB من إعادة تنزيل محكوم عليها بالفشل على شبكة بطيئة.
 *
 * إعادة المحاولة (بعد مسح الكاش أو فوقه) تُخرج المتصفحات التي علِق فيها رد
 * قديم/ناقص من الحلقة المسدودة، وكانت تحتاج قبل ذلك مسح بيانات الموقع يدوياً.
 */
function ensureWorker(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const errors: string[] = [];
    const startedAt = Date.now();
    const withinDeadline = () => Date.now() - startedAt <= INIT_DEADLINE_MS;

    const engines = preferredEngines();
    for (let engineIndex = 0; engineIndex < engines.length; engineIndex++) {
      if (!withinDeadline()) break;
      const engine = engines[engineIndex];
      // كل ما بعد الإصدار الأول = إصدار بديل (نُخبر الطالب بذلك في شريط التقدّم).
      const fallback = engineIndex > 0;

      const sources: string[] = [];
      if (engine.selfHosted) sources.push(sameOriginBase(engine.version));
      sources.push(cdnBase(engine.version));

      let bootFailed = false;

      for (const base of sources) {
        if (!withinDeadline()) break;

        try {
          await tryInitFrom(base, false, fallback);
          rememberEngine(engine.version);
          return;
        } catch (e) {
          // tryInitFrom أنهى الـ Worker وأسقط المرجع بنفسه؛ لا نستدعي
          // resetWorker هنا لأنه كان سيُفرغ readyPromise أثناء تنفيذها.
          const message = (e as Error).message;
          errors.push(`${base} → ${message}`);
          const kind = classifyFailure(message);

          if (kind === 'device') {
            bootFailed = true;
            break;
          }

          if (!withinDeadline()) break;
          const reload = kind === 'cache';
          if (reload) await clearEngineCache();
          try {
            await tryInitFrom(base, reload, fallback);
            rememberEngine(engine.version);
            return;
          } catch (e2) {
            errors.push(`${base} → ${(e2 as Error).message}`);
          }
        }
      }

      if (bootFailed) {
        // كاش هذا الإصدار لم يعد موثوقاً بعد فشل الإقلاع؛ امسحه حتى لا يعود
        // الطالب إليه في المحاولة القادمة بدل الإصدار الأقدم الناجح.
        await clearEngineCache();
        forgetEngine(engine.version);
      }
    }

    if (!withinDeadline()) errors.push('تجاوزنا الوقت المسموح لتحميل المحرك');

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
  // السطر الحقيقي من Python يأتي الآن ضمن الرسالة (نلتقط stderr في الـ Worker).
  if (/init_fs_encoding|encodings|Fatal Python error/i.test(reason)) {
    return 'محرك Python لا يستطيع الإقلاع على هذا المتصفح/الجهاز حتى بعد تجربة إصدار أقدم. افتح الموقع من Chrome أو Safari مباشرة (لا من متصفح داخل تطبيق مثل فيسبوك أو إنستجرام)، وأغلق التطبيقات الأخرى ثم أعد المحاولة. إن تكرر فأبلغنا بنوع الجهاز وإصدار المتصفح.';
  }
  if (/exit\(1\)/i.test(reason)) {
    return 'المحرك نزل لكن بايثون فشل في الإقلاع. أعد المحاولة والموقع في المقدمة (لا تخرج منه)، ولو تكرر أغلق التطبيق وافتحه من جديد.';
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
  // نُبقي آخر محاولتين فقط (الأحدث والأدق)، ونقصّ كل سطر حتى لا تختفي تفاصيل
  // stderr المهمة في آخر الرسالة خلف عناوين المحاولات السابقة.
  const lines = reason
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .map((line) => (line.length > 320 ? `${line.slice(0, 320)}…` : line));
  const detail = lines.join(' • ');
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
