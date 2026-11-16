/**
 * نغمة نجاح قصيرة بـ WebAudio — بلا ملف صوتي (لا تحميل إضافي).
 *
 * المتصفحات تسمح بتشغيل الصوت فقط بعد تفاعل المستخدم، لذلك نستدعي
 * `unlockAudio()` من داخل معالج الضغط على «تسليم» (قبل طلب الشبكة)، ثم
 * نعزف النغمة بعد وصول النتيجة. أي فشل هنا صامت تماماً ولا يؤثر على الواجهة.
 */

let ctx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** يفتح/يستأنف سياق الصوت أثناء تفاعل المستخدم حتى يُسمح بالعزف لاحقاً. */
export function unlockAudio(): void {
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
}

/** يفضّل عدم تشغيل الصوت لمن طلب تقليل الحركة/الصوت في نظامه. */
function prefersQuiet(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** نغمة صاعدة قصيرة (دو-مي-صول) عند النجاح في امتحان. */
export function playSuccessChime(): void {
  if (prefersQuiet()) return;
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended') {
    void c.resume().catch(() => {});
  }

  const now = c.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.11;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}
