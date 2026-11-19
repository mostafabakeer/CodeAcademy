import { getVideoProgressLocal, mergeWatchSegments } from './localStore';

/**
 * متتبّع مشاهدة حقيقي — الواجهة الأمامية فقط.
 *
 * الفكرة: لا نثق بموضع الفيديو. نحفظ **فترات** شوهدت فعلاً، ونضيف فترة جديدة
 * فقط لو كان تقدّم الموضع متسقاً مع الزمن الحقيقي المنقضي × سرعة التشغيل.
 * أي قفزة أكبر من ذلك = سحب/تقفيل ⇒ لا تُحتسب مشاهدة.
 *
 * - `seconds` في التخزين المحلي = مجموع هذه الفترات (التغطية).
 * - `position` منفصل للاستئناف، حتى لو لم يُحتسب الموضع كمشاهدة.
 */

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** هامش ثانية ونصف يغطي تذبذب مؤقّت المتصفح وtimeupdate. */
const SEEK_TOLERANCE_SECONDS = 1.5;

export class WatchTracker {
  private segments: [number, number][];
  private lastPos: number | null = null;
  private lastAt: number | null = null;
  private pos = 0;
  private duration = 0;

  constructor(lessonId: number, duration: number) {
    const saved = getVideoProgressLocal(lessonId);
    this.duration = Math.max(0, Number(duration) || Number(saved?.duration) || 0);
    this.segments = saved?.segments?.length
      ? mergeWatchSegments(saved.segments)
      : saved?.seconds
        ? [[0, saved.seconds]]
        : [];
    this.pos = Math.max(0, Number(saved?.position) || this.segmentsEnd());
    this.clip();
  }

  /** تُستدعى عند معرفة مدة الفيديو من الميتاداتا. */
  setDuration(duration: number): void {
    const d = Math.max(0, Number(duration) || 0);
    if (d > 0) this.duration = d;
    this.clip();
  }

  getSegments(): [number, number][] {
    return this.segments.map(([a, b]) => [a, b] as [number, number]);
  }

  /** آخر موضع تشغيل معروف (للاستئناف). */
  getPosition(): number {
    return this.pos;
  }

  /** الثواني المُشاهدة فعلاً (مقصوصة على مدة الدرس). */
  coveredSeconds(): number {
    let total = 0;
    for (const [a, b] of this.segments) {
      const start = Math.max(0, a);
      const end = this.duration > 0 ? Math.min(b, this.duration) : b;
      if (end > start) total += end - start;
    }
    return total;
  }

  progressPct(): number {
    if (this.duration <= 0) return 0;
    return Math.min(100, (this.coveredSeconds() / this.duration) * 100);
  }

  /**
   * تُستدعى من المشغّل كل ثانية (وأكثر مع timeupdate).
   * playing=false (إيقاف/نهاية) تُصفّر المرجع حتى لا تُحتسب فترة الإيقاف.
   */
  tick(position: number, playing: boolean, rate = 1): void {
    const pos = Math.max(0, Number(position) || 0);
    this.pos = pos;

    if (!playing) {
      this.lastPos = null;
      this.lastAt = null;
      return;
    }

    const now = nowMs();
    if (this.lastPos === null || this.lastAt === null) {
      this.lastPos = pos;
      this.lastAt = now;
      return;
    }

    const posDelta = pos - this.lastPos;
    const wallDelta = Math.max(0, (now - this.lastAt) / 1000);
    const expected = wallDelta * Math.max(1, Number(rate) || 1);

    // تقدّم طبيعي فقط. أي قفزة أكبر = seek ⇒ لا تُحتسب.
    if (posDelta > 0 && posDelta <= expected + SEEK_TOLERANCE_SECONDS) {
      this.addInterval(this.lastPos, pos);
    }

    this.lastPos = pos;
    this.lastAt = now;
  }

  private addInterval(start: number, end: number): void {
    if (!(end > start)) return;
    const from = Math.max(0, start);
    const to = this.duration > 0 ? Math.min(end, this.duration) : end;
    if (to <= from) return;
    this.segments = mergeWatchSegments([...this.segments, [from, to]]);
  }

  private segmentsEnd(): number {
    return this.segments.length ? this.segments[this.segments.length - 1][1] : 0;
  }

  private clip(): void {
    if (this.duration <= 0) return;
    this.segments = mergeWatchSegments(
      this.segments
        .map(([a, b]) => [Math.min(a, this.duration), Math.min(b, this.duration)] as [number, number])
        .filter(([a, b]) => b > a),
    );
  }
}
