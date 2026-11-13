/**
 * صوت الإشعارات — مصدر واحد لكل الصفحة.
 *
 * لماذا Web Audio وليس ملف MP3 خارجي؟
 * - التشغيل التلقائي (autoplay) يمنع `audio.play()` بعد أي `await` بلا تفاعل
 *   مستخدم، وهو ما كان يحدث بعد رفع ملف. الحل: نفتح AudioContext عند أول لمسة
 *   ونُبقيه جاهزاً، فيصبح تشغيل النغمة لاحقاً مسموحاً.
 * - لا طلبات شبكة ولا ملفات خارجية تفشل مع الشبكات الضعيفة أو الحجب.
 * - النغمة قصيرة ومولّدة، فلا تحتاج أصولاً ثقيلة أو حقوق استخدام.
 */

const MUTE_KEY = 'codeacademy_notification_sound_muted';

export type SoundKind = 'success' | 'alert' | 'message';

let ctx: AudioContext | null = null;
let unlocked = false;
let unlockInstalled = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function isNotificationSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** يُستدعى داخل أول تفاعل حقيقي (لمسة/مفتاح) لفتح الصوت في iOS وأندرويد. */
export function unlockNotificationSound(): void {
  const audio = getAudioContext();
  if (!audio) return;
  const resume = () => {
    if (audio.state === 'suspended') {
      void audio.resume().catch(() => {});
    }
  };
  resume();
  if (audio.state === 'running') unlocked = true;
  // بعض المتصفحات تحتاج التفاعل نفسه لبدء التشغيل.
  try {
    const buffer = audio.createBuffer(1, 1, 22_050);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(0);
    unlocked = true;
  } catch {
    /* ignore */
  }
}

/** يثبّت مستمعاً واحداً على مستوى التطبيق — آمن للاستدعاء أكثر من مرة. */
export function installSoundUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const handler = () => {
    unlockNotificationSound();
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('touchstart', handler);
  };
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('keydown', handler);
  window.addEventListener('touchstart', handler, { passive: true });
}

/** نغمة قصيرة. تُرجع false لو لم يكن التشغيل ممكناً (بدل رمي استثناء). */
export function playNotificationSound(kind: SoundKind = 'message'): boolean {
  if (isNotificationSoundMuted()) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;

  const audio = getAudioContext();
  if (!audio) return false;

  if (audio.state === 'suspended') {
    // بدون تفاعل سابق سيبقى suspended؛ لا نفسد التجربة برسائل خطأ.
    void audio.resume().catch(() => {});
    if (!unlocked) return false;
  }

  const now = audio.currentTime;
  const notes: { freq: number; at: number; dur: number }[] =
    kind === 'success'
      ? [
          { freq: 660, at: 0, dur: 0.11 },
          { freq: 880, at: 0.12, dur: 0.16 },
        ]
      : kind === 'alert'
        ? [
            { freq: 880, at: 0, dur: 0.1 },
            { freq: 660, at: 0.13, dur: 0.1 },
            { freq: 880, at: 0.26, dur: 0.14 },
          ]
        : [
            { freq: 740, at: 0, dur: 0.1 },
            { freq: 990, at: 0.11, dur: 0.14 },
          ];

  for (const note of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;
    // غلاف هادئ يمنع الطقطقة ويجعل الصوت غير مزعج.
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.exponentialRampToValueAtTime(0.22, now + note.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.02);
  }

  return true;
}
