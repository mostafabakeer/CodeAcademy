import { useEffect, useRef, useState, useCallback } from 'react';
import type Hls from 'hls.js';
import { useLang } from '../i18n';
import { extractYouTubeId, isYouTubeUrl, getYouTubeThumbnail } from '../lib/youtube';
import YouTubePlayer from './YouTubePlayer';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  autoPlay?: boolean;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  resumeAt?: number;
  videoType?: 'youtube' | 'upload';
  videoUrl?: string;
  initialTime?: number;
  onProgress?: (seconds: number) => void;
  onDuration?: (duration: number) => void;
}

const RATES = [1, 1.25, 1.5, 2];
const QUALITY_LABELS: Record<string, string> = {
  auto: 'Auto', hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p',
};

function resolveMode(videoType: string | undefined, videoUrl: string): 'youtube' | 'upload' | 'invalid' {
  const id = extractYouTubeId(videoUrl);
  if (videoType === 'upload') return 'upload';
  if (videoType === 'youtube') return id ? 'youtube' : 'invalid';
  return isYouTubeUrl(videoUrl) ? 'youtube' : 'upload';
}

export default function VideoPlayer({
  src, poster, autoPlay = false, onTimeUpdate, onDurationChange, onEnded, onError,
  resumeAt = 0, videoType, videoUrl, initialTime, onProgress, onDuration,
}: VideoPlayerProps) {
  const { t } = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const keyboardActiveRef = useRef(false);
  const bootResume = resumeAt || initialTime || 0;
  const effectiveSrc = src || videoUrl || '';
  const mode = resolveMode(videoType, videoUrl ?? src ?? '');
  const isYouTube = mode === 'youtube';
  const ytId = extractYouTubeId(videoUrl ?? src ?? '');

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(() => Number(localStorage.getItem('dr_video_rate')) || 1);
  const [quality, setQuality] = useState(() => localStorage.getItem('dr_video_quality') || 'auto');
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hlsLevels, setHlsLevels] = useState<string[]>([]);

  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) {
        setCurrentTime(v.currentTime);
        onTimeUpdate?.(v.currentTime);
        onProgress?.(Math.floor(v.currentTime));
      }
    }, 1000);
  }, [onTimeUpdate, onProgress]);

  const stopTick = useCallback(() => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } }, []);

  const cleanupHls = useCallback(() => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } setHlsLevels([]); }, []);

  const applyHlsQuality = useCallback((hls: Hls, videoEl: HTMLVideoElement, levels: string[]) => {
    const idx = levels.findIndex(l => l === quality);
    if (idx >= 0 && hls.levels[idx]) (hls as any).level = idx;
    else { let best = 0; for (let i = 0; i < levels.length; i++) { const h = parseInt(levels[i]); const qh = parseInt(quality.replace('p', '')); if (!isNaN(qh) && (!isNaN(parseInt(levels[best].replace('p', ''))) || h >= qh)) best = i; } (hls as any).level = best; }
  }, [quality]);

  const startHls = useCallback(async (srcUrl: string, videoEl: HTMLVideoElement) => {
    const mod = await import('hls.js').catch(() => null);
    if (!mod) { setError(t('video.unavailable')); setIsLoading(false); return; }
    const HlsLib = mod.default;
    if (!HlsLib.isSupported()) { if ('mediaSources' in videoEl) videoEl.src = srcUrl; else { setError(t('video.unavailable')); setIsLoading(false); } return; }
    const hls = new HlsLib({ maxBufferLength: 30, maxMaxBufferLength: 60, lowLatencyMode: false });
    hlsRef.current = hls;
    hls.on(HlsLib.Events.MANIFEST_PARSED, (_evt, data) => { const levels = data.levels.map(l => `${l.height}px`); setHlsLevels(levels); applyHlsQuality(hls, videoEl, levels); });
    hls.on(HlsLib.Events.ERROR, (_evt, detail) => { if (detail.fatal) { if (detail.type === HlsLib.ErrorTypes.NETWORK_ERROR) hls.startLoad(); else if (detail.type === HlsLib.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError(); else { setError(t('video.unavailable')); setIsLoading(false); } } });
    hls.loadSource(srcUrl); hls.attachMedia(videoEl);
  }, [applyHlsQuality, t]);

  const togglePlay = useCallback(async () => {
    const v = videoRef.current; if (!v) return;
    if (!hasStarted || v.src !== effectiveSrc) { setHasStarted(true); setIsLoading(true); v.src = effectiveSrc; v.poster = poster || ''; v.load(); await new Promise<void>(resolve => { const onMeta = () => { v.removeEventListener('loadedmetadata', onMeta); resolve(); }; v.addEventListener('loadedmetadata', onMeta, { once: true }); setTimeout(resolve, 500); }); }
    if (isPlaying) { v.pause(); setIsPlaying(false); stopTick(); } else { try { setIsLoading(true); await v.play(); setIsPlaying(true); setIsLoading(false); startTick(); } catch { setIsLoading(false); setError(t('video.error')); } }
  }, [isPlaying, hasStarted, effectiveSrc, poster, startTick, stopTick, t]);

  const seek = useCallback((s: number) => {
    const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(s, v.duration)); setCurrentTime(v.currentTime); onTimeUpdate?.(v.currentTime);
  }, [onTimeUpdate]);

  const cycleRate = useCallback(() => { const i = RATES.indexOf(rate); const next = RATES[(i + 1) % RATES.length]; setRate(next); localStorage.setItem('dr_video_rate', String(next)); const v = videoRef.current; if (v) v.playbackRate = next; }, [rate]);

  const cycleQuality = useCallback(() => { const all = ['auto', 'hd1080', 'hd720', 'large', 'medium']; const i = all.indexOf(quality); const next = all[(i + 1) % all.length]; setQuality(next); localStorage.setItem('dr_video_quality', next); if (hlsRef.current) applyHlsQuality(hlsRef.current, videoRef.current!, hlsLevels); }, [quality, hlsLevels, applyHlsQuality]);

  const toggleMute = useCallback(() => { const next = !isMuted; setIsMuted(next); const v = videoRef.current; if (v) v.muted = next; }, [isMuted]);

  const togglePiP = useCallback(async () => { const v = videoRef.current; if (!v) return; try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch {} }, []);

  const toggleFullscreen = useCallback(() => { const el = containerRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen(); }, []);

  const retryNative = useCallback(() => { const v = videoRef.current; setError(null); if (!v) return; setIsLoading(true); setHasStarted(false); cleanupHls(); if (/\.m3u8(\?.*)?$/.test(effectiveSrc)) void startHls(effectiveSrc, v); else v.load(); }, [effectiveSrc, startHls, cleanupHls]);

  const handleMouseMove = useCallback(() => { setShowControls(true); if (hideTimeout.current) clearTimeout(hideTimeout.current); hideTimeout.current = setTimeout(() => { if (isPlaying) setShowControls(false); }, 3000); }, [isPlaying]);

  const formatTime = (s: number) => { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; };

  useEffect(() => { const handler = (e: KeyboardEvent) => { if (!keyboardActiveRef.current) return; const v = videoRef.current; switch (e.key) { case ' ': case 'k': e.preventDefault(); togglePlay(); break; case 'ArrowRight': e.preventDefault(); seek((v?.currentTime ?? 0) + 10); break; case 'ArrowLeft': e.preventDefault(); seek(Math.max(0, (v?.currentTime ?? 0) - 10)); break; case 'f': e.preventDefault(); toggleFullscreen(); break; case 'm': e.preventDefault(); toggleMute(); break; } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [togglePlay, seek, toggleFullscreen, toggleMute]);

  useEffect(() => { keyboardActiveRef.current = true; return () => { keyboardActiveRef.current = false; }; }, []);

  useEffect(() => {
    let mounted = true;
    setError(null); setHasStarted(false); setDuration(0); setCurrentTime(0); setIsPlaying(false); setIsLoading(true); cleanupHls();

    const v = videoRef.current; if (!v) return;
    const srcUrl = effectiveSrc;
    if (/\.m3u8(\?.*)?$/.test(srcUrl)) void startHls(srcUrl, v);
    else { if (v.src !== effectiveSrc) { v.src = effectiveSrc; v.poster = poster || ''; v.load(); } }

    const onMeta = () => { const el = videoRef.current; if (!el || !mounted) return; setDuration(el.duration); onDuration?.(el.duration); onDurationChange?.(el.duration); if (bootResume > 0 && bootResume < el.duration) el.currentTime = bootResume; };
    const onPlay = () => { if (!mounted) return; setIsPlaying(true); setIsLoading(false); startTick(); };
    const onPause = () => { if (!mounted) return; setIsPlaying(false); stopTick(); };
    const onEndedEvent = () => { if (!mounted) return; setIsPlaying(false); stopTick(); onEnded?.(); };
    const onWaiting = () => { if (!mounted) return; setIsLoading(true); };
    const onCanPlay = () => { if (!mounted) return; setIsLoading(false); };
    const onVideoError = () => { if (!mounted) return; setError(t('video.error')); setIsLoading(false); stopTick(); onError?.(new Error(t('video.error'))); };
    const onTimeUpdateEvent = () => { const el = videoRef.current; if (!el || !mounted) return; setCurrentTime(el.currentTime); onTimeUpdate?.(el.currentTime); onProgress?.(Math.floor(el.currentTime)); };

    v.addEventListener('loadedmetadata', onMeta, { once: true });
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause); v.addEventListener('ended', onEndedEvent);
    v.addEventListener('waiting', onWaiting); v.addEventListener('canplay', onCanPlay); v.addEventListener('error', onVideoError); v.addEventListener('timeupdate', onTimeUpdateEvent);

    return () => {
      mounted = false;
      v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('ended', onEndedEvent);
      v.removeEventListener('waiting', onWaiting); v.removeEventListener('canplay', onCanPlay); v.removeEventListener('error', onVideoError); v.removeEventListener('timeupdate', onTimeUpdateEvent);
      cleanupHls(); stopTick();
    };
  }, [effectiveSrc, poster, bootResume, onDuration, onDurationChange, onEnded, startHls, t, cleanupHls, stopTick, startTick, onTimeUpdate, onProgress]);

  useEffect(() => { const saved = localStorage.getItem('dr_video_rate'); if (saved && !isNaN(Number(saved))) { const r = Number(saved); if (r >= 0.25 && r <= 4) { setRate(r); const v = videoRef.current; if (v) v.playbackRate = r; } } }, []);

  if (mode === 'invalid') return <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-ink-900 p-4"><p className="text-red-400 text-sm">{t('video.invalidUrl')}</p></div>;

  if (isYouTube) {
    return (
      <YouTubePlayer
        videoId={ytId!}
        initialTime={bootResume}
        onReady={() => {}}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        onError={(e) => { setError(e); setIsLoading(false); }}
        onDuration={(d) => { setDuration(d); onDuration?.(d); onDurationChange?.(d); }}
        onTimeUpdate={onTimeUpdate}
        onProgress={onProgress}
        playbackRate={rate}
        muted={isMuted}
        autoPlay={autoPlay}
      />
    );
  }

  if (error) return (
    <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-ink-900/50 p-4">
      <div className="text-center"><p className="font-semibold text-red-400">⚠️ {error}</p>
      <button onClick={retryNative} className="mt-4 btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">{t('video.retry')}</button></div>
    </div>
  );

  return (
    <div ref={containerRef} tabIndex={0} className="relative aspect-video rounded-2xl overflow-hidden bg-ink-900 select-none outline-none" onMouseMove={handleMouseMove} onMouseLeave={() => isPlaying && setShowControls(false)}>
      {!hasStarted && (
        <div className="absolute inset-0 cursor-pointer z-20 flex items-center justify-center" onClick={togglePlay}>
          {poster ? <img src={poster} alt="Video" className="w-full h-full object-cover opacity-90" /> : <div className="w-full h-full bg-gradient-to-br from-ink-800 to-ink-900 opacity-90" />}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-fire-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg touch-target">
              <svg className="h-10 w-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </div>
      )}
      {isLoading && !hasStarted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-900/60 pointer-events-none">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-fire-500/30 border-t-fire-500" />
        </div>
      )}
      <video ref={videoRef} playsInline preload="metadata" className="absolute inset-0 w-full h-full object-contain" />
      {isLoading && hasStarted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-900/60 pointer-events-none">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-fire-500/30 border-t-fire-500" />
        </div>
      )}
      {showControls && (isPlaying || hasStarted) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 z-30">
          <input type="range" min={0} max={duration || 100} value={currentTime} onChange={e => seek(Number(e.target.value))} className="w-full h-1 mb-2 accent-fire-500 cursor-pointer" />
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="p-2 text-white hover:text-fire-400 transition-colors" title={isPlaying ? t('video.pause') : t('video.play')}>
              {isPlaying ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <span className="text-xs text-gray-300 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <div className="flex-1" />
            <button onClick={toggleMute} className="p-2 text-white hover:text-fire-400 transition-colors" title={t('video.mute') || 'Mute'}>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">{isMuted ? <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /> : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />}</svg>
            </button>
            <button onClick={cycleRate} className="px-2 py-1 text-xs font-bold text-white bg-white/10 rounded hover:bg-white/20 transition-colors" title={t('video.speed')}>{rate}x</button>
            <button onClick={cycleQuality} className="px-2 py-1 text-xs font-bold text-white bg-white/10 rounded hover:bg-white/20 transition-colors" title={t('video.quality')}>{QUALITY_LABELS[quality]}</button>
            <button onClick={togglePiP} className="p-2 text-white hover:text-fire-400 transition-colors" title={t('video.pip')}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4zM4 12l4-4 4 4M16 8l-4 4-4-4" /></svg></button>
            <button onClick={toggleFullscreen} className="p-2 text-white hover:text-fire-400 transition-colors" title={t('video.fullscreen')}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h-4m4 0l-5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
          </div>
        </div>
      )}
    </div>
  );
}