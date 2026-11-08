import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { useLang } from '../i18n';
import { extractYouTubeId, isYouTubeUrl, getYouTubeThumbnail } from '../lib/youtube';

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
  auto: 'Auto',
  hd1080: '1080p',
  hd720: '720p',
  large: '480p',
  medium: '360p',
};

function resolveMode(videoType: string | undefined, videoUrl: string): 'youtube' | 'upload' | 'invalid' {
  const id = extractYouTubeId(videoUrl);
  if (videoType === 'upload') return 'upload';
  if (videoType === 'youtube') return id ? 'youtube' : 'invalid';
  return isYouTubeUrl(videoUrl) ? 'youtube' : 'upload';
}

export default function VideoPlayer({
  src,
  poster,
  autoPlay = false,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  onError,
  resumeAt = 0,
  videoType,
  videoUrl,
  initialTime,
  onProgress,
  onDuration,
}: VideoPlayerProps) {
  const { t, lang } = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytApiReadyRef = useRef(false);
  const ytPlayerReadyRef = useRef(false);
  const ytQueueRef = useRef<{ time: number; rate: number; mute: boolean } | null>(null);
  const keyboardActiveRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState(() => localStorage.getItem('dr_video_quality') || 'auto');
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [ytApiError, setYtApiError] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hlsLevels, setHlsLevels] = useState<string[]>([]);

  const effectiveSrc = src || videoUrl || '';
  const mode = resolveMode(videoType, videoUrl ?? src ?? '');
  const isYouTube = mode === 'youtube';
  const ytId = extractYouTubeId(videoUrl ?? src ?? '');
  const bootResume = resumeAt || initialTime || 0;

  // ===== Tick logic (shared) =====
  const startTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      if (isYouTube) {
        const player = ytPlayerRef.current;
        if (player?.getPlayerState() === 1) { // PLAYING
          const ct = player.getCurrentTime();
          setCurrentTime(ct);
          onTimeUpdate?.(ct);
          onProgress?.(Math.floor(ct));
        }
      } else {
        const v = videoRef.current;
        if (v && !v.paused) {
          setCurrentTime(v.currentTime);
          onTimeUpdate?.(v.currentTime);
          onProgress?.(Math.floor(v.currentTime));
        }
      }
    }, 1000);
  };

  const stopTick = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  // ===== HLS Setup =====
  /**
   * تحميل hls.js عند الحاجة فقط (روابط .m3u8). المكتبة ثقيلة (~150KB gzip)
   * وكانت تُحمَّل مع صفحة الدرس حتى لو كان الفيديو يوتيوب أو MP4.
   */
  const startHls = async (srcUrl: string, videoEl: HTMLVideoElement) => {
    const mod = await import('hls.js').catch(() => null);
    if (!mod) {
      setError(t('video.unavailable'));
      setIsLoading(false);
      return;
    }
    const HlsLib = mod.default;
    if (!HlsLib.isSupported()) {
      if ('mediaSources' in videoEl) {
        videoEl.src = srcUrl; // HLS أصلي (Safari)
      } else {
        setError(t('video.unavailable'));
        setIsLoading(false);
      }
      return;
    }
    setupHls(HlsLib, srcUrl, videoEl);
  };

  const setupHls = (HlsLib: typeof import('hls.js').default, srcUrl: string, videoEl: HTMLVideoElement) => {
    const hls = new HlsLib({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      lowLatencyMode: false,
    });
    hlsRef.current = hls;

    hls.on(HlsLib.Events.MANIFEST_PARSED, (_, data) => {
      const levels = data.levels.map((l) => `${l.height}px`);
      setHlsLevels(levels);
      applyHlsQuality(hls, videoEl, levels);
    });

    hls.on(HlsLib.Events.ERROR, (_evt, detail) => {
      console.warn('[hls] error:', detail.type, detail.details);
      if (detail.fatal) {
        if (detail.type === HlsLib.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (detail.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError(t('video.unavailable'));
          setIsLoading(false);
        }
      }
    });

    hls.loadSource(srcUrl);
    hls.attachMedia(videoEl);
  };

  const applyHlsQuality = (hls: Hls, videoEl: HTMLVideoElement, levels: string[]) => {
    const idx = levels.findIndex((l) => l === quality);
    if (idx >= 0 && hls.levels[idx]) {
      (hls as any).level = idx;
    } else {
      // Find closest match
      let best = 0;
      for (let i = 0; i < levels.length; i++) {
        const h = parseInt(levels[i]);
        const qh = parseInt(quality.replace('p', ''));
        if (!isNaN(qh) && (!isNaN(parseInt(levels[best].replace('p', ''))) || h >= qh)) {
          best = i;
        }
      }
      (hls as any).level = best;
    }
  };

  const cleanupHls = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setHlsLevels([]);
  };

  // ===== YouTube IFrame API Setup =====
  const loadYouTubeApi = (cb: () => void, onFail: () => void) => {
    if ((window as any).YT?.Player) {
      cb();
      return;
    }
    // إذا كان السكربت أضيف بالفعل (مثلاً بعد إعادة المحاولة) لا نضيفه مرتين.
    if (document.querySelector('script[data-yt-iframe-api]')) {
      const wait = () => {
        if ((window as any).YT?.Player) cb();
        else setTimeout(wait, 150);
      };
      wait();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.ytIframeApi = '1';
    // الشبكة قد تحجب يوتيوب كلياً — لا نترك المستخدم أمام سبينر أبدي.
    const deadline = Date.now() + 12_000;
    const poll = () => {
      if (ytApiReadyRef.current) return;
      if ((window as any).YT?.ready) {
        ytApiReadyRef.current = true;
        cb();
        return;
      }
      if (Date.now() > deadline) {
        onFail();
        return;
      }
      setTimeout(poll, 150);
    };
    script.onload = () => setTimeout(poll, 300);
    script.onerror = onFail;
    document.head.appendChild(script);
    setTimeout(poll, 300);
  };

  const initYouTubePlayer = (container: HTMLDivElement) => {
    if (!ytId || !ytApiReadyRef.current) return;
    const queued = ytQueueRef.current;
    ytQueueRef.current = null;

    const player = new (window as any).YT.Player(container, {
      videoId: ytId,
      playerVars: {
        autoplay: autoPlay ? 1 : 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin,
        cc_load_policy: 1,
        iv_load_policy: 1,
      },
      events: {
        onReady: () => {
          ytPlayerReadyRef.current = true;
          const p = player;
          if (queued) {
            if (queued.time > 0) p.seekTo(queued.time, true);
            p.setPlaybackRate(queued.rate);
            p.setVolume(queued.mute ? 0 : 100);
          }
          if (!autoPlay) {
            setIsLoading(false);
            setHasStarted(true);
          }
        },
        onStateChange: (ev: { data: number }) => {
          const s = ev.data;
          if (s === (window as any).YT.PlayerState.PLAYING) {
            setIsPlaying(true);
            setIsLoading(false);
            startTick();
            setHasStarted(true);
          } else if (s === (window as any).YT.PlayerState.PAUSED || s === (window as any).YT.PlayerState.ENDED) {
            setIsPlaying(false);
            stopTick();
            if (s === (window as any).YT.PlayerState.ENDED) onEnded?.();
          } else if (s === (window as any).YT.PlayerState.BUFFERING) {
            setIsLoading(true);
          }
        },
        onError: () => {
          setYtApiError(true);
          setIsLoading(false);
          setError(t('video.embedBlocked'));
        },
      },
    });
    ytPlayerRef.current = player;

    // Restore resume time
    if (bootResume > 0) {
      if (ytPlayerReadyRef.current) {
        player.seekTo(bootResume, true);
      } else {
        ytQueueRef.current = { time: bootResume, rate, mute: isMuted };
      }
    }

    // Set duration once ready
    if (ytPlayerReadyRef.current) {
      const d = player.getDuration();
      setDuration(d);
      onDuration?.(d);
      onDurationChange?.(d);
    }
  };

  const togglePlay = async () => {
    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (!player) return;
      if (isPlaying) player.pauseVideo();
      else player.playVideo();
    } else {
      const v = videoRef.current;
      if (!v) return;
      if (isPlaying) { v.pause(); setIsPlaying(false); stopTick(); }
      else {
        if (!hasStarted) {
          // First play - need to load source
          if (!v.src || v.src === window.location.href) {
            v.src = effectiveSrc;
            v.poster = poster || '';
            v.load();
          }
          try {
            await v.play();
            setIsPlaying(true);
            setIsLoading(false);
            startTick();
            setHasStarted(true);
          } catch {}
        } else {
          v.play().catch(() => {});
          setIsPlaying(true);
          startTick();
        }
      }
    }
  };

  const seek = (s: number) => {
    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (!player) return;
      player.seekTo(Math.max(0, Math.min(s, duration || 0)), true);
      setCurrentTime(s);
    } else {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(s, v.duration));
      setCurrentTime(v.currentTime);
      onTimeUpdate?.(v.currentTime);
    }
  };

  const cycleRate = () => {
    const i = RATES.indexOf(rate);
    const next = RATES[(i + 1) % RATES.length];
    setRate(next);
    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (player) player.setPlaybackRate(next);
    } else {
      const v = videoRef.current;
      if (v) v.playbackRate = next;
    }
    localStorage.setItem('dr_video_rate', String(next));
  };

  const cycleQuality = () => {
    const levels = isYouTube ? ['auto', 'hd1080', 'hd720', 'large', 'medium'] : hlsLevels.map((l) => l.replace('px', '') + 'p');
    const all = ['auto', 'hd1080', 'hd720', 'large', 'medium'];
    const i = all.indexOf(quality);
    const next = all[(i + 1) % all.length];
    setQuality(next);
    localStorage.setItem('dr_video_quality', next);
    if (!isYouTube && hlsRef.current) {
      applyHlsQuality(hlsRef.current, videoRef.current!, levels);
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (isYouTube) {
      const player = ytPlayerRef.current;
      if (player) player.setVolume(next ? 0 : 100);
    } else {
      const v = videoRef.current;
      if (v) v.muted = next;
    }
  };

  const togglePiP = async () => {
    if (isYouTube) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  };

  /** إعادة محاولة تشغيل الفيديو المرفوع بعد خطأ شبكة — بدون إعادة تحميل الصفحة. */
  const retryNative = () => {
    const v = videoRef.current;
    setError(null);
    if (!v) return;
    setIsLoading(true);
    setHasStarted(false);
    cleanupHls();
    if (/\.m3u8(\?.*)?$/.test(effectiveSrc)) {
      void startHls(effectiveSrc, v);
    } else {
      v.load(); // يعيد تحميل نفس المصدر
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => { if (isPlaying) setShowControls(false); }, 3000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Use the shared utility function for YouTube thumbnails

  // ===== Keyboard Shortcuts =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!keyboardActiveRef.current) return;
      const v = isYouTube ? null : videoRef.current;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek((v?.currentTime ?? ytPlayerRef.current?.getCurrentTime() ?? 0) + 10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, (v?.currentTime ?? ytPlayerRef.current?.getCurrentTime() ?? 0) - 10));
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isYouTube]);

  // Focus container on mount for keyboard shortcuts
  useEffect(() => {
    keyboardActiveRef.current = true;
    return () => { keyboardActiveRef.current = false; };
  }, []);

  // ===== Init on mode/url change =====
  useEffect(() => {
    setError(null);
    setYtApiError(false);
    setHasStarted(false);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setIsLoading(true);
    cleanupHls();
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy(); } catch {}
      ytPlayerRef.current = null;
      ytPlayerReadyRef.current = false;
    }
    if (ytContainerRef.current) {
      while (ytContainerRef.current.firstChild) ytContainerRef.current.removeChild(ytContainerRef.current.firstChild);
    }

    if (isYouTube) {
      loadYouTubeApi(
        () => {
          if (ytContainerRef.current) {
            initYouTubePlayer(ytContainerRef.current);
          }
        },
        () => {
          // فشل تحميل واجهة يوتيوب ⇒ عرض رابط المشاهدة الخارجي بدل الانتظار.
          setYtApiError(true);
          setError(t('video.embedBlocked'));
          setIsLoading(false);
        },
      );
      return;
    }

    // Upload / native video
    const v = videoRef.current;
    if (!v) return;

    const srcUrl = effectiveSrc;
    if (/\.m3u8(\?.*)?$/.test(srcUrl)) {
      // hls.js يُحمَّل ديناميكياً (chunk منفصل) بدل تحميله مع كل درس.
      void startHls(srcUrl, v);
    } else {
      v.src = srcUrl;
      v.poster = poster || '';
    }

    const onMeta = () => {
      const el = videoRef.current;
      if (!el) return;
      setDuration(el.duration);
      onDuration?.(el.duration);
      onDurationChange?.(el.duration);
      if (bootResume > 0 && bootResume < el.duration) el.currentTime = bootResume;
    };
    const onPlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
      startTick();
    };
    const onPause = () => {
      setIsPlaying(false);
      stopTick();
    };
    const onEndedEvent = () => {
      setIsPlaying(false);
      stopTick();
      onEnded?.();
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onVideoError = () => {
      setError(t('video.error'));
      setIsLoading(false);
      stopTick();
      onError?.(new Error(t('video.error')));
    };
    const onTimeUpdateEvent = () => {
      const el = videoRef.current;
      if (el) {
        setCurrentTime(el.currentTime);
        onTimeUpdate?.(el.currentTime);
        onProgress?.(Math.floor(el.currentTime));
      }
    };

    v.addEventListener('loadedmetadata', onMeta, { once: true });
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEndedEvent);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('error', onVideoError);
    v.addEventListener('timeupdate', onTimeUpdateEvent);

    return () => {
      // إزالة نفس الدوال (سابقاً كانت closures جديدة ⇒ المستمعون يتراكمون
      // مع كل تغيير مصدر ويتكرر استدعاء onProgress عدة مرات في الثانية).
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEndedEvent);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('error', onVideoError);
      v.removeEventListener('timeupdate', onTimeUpdateEvent);
      cleanupHls();
    };
  }, [effectiveSrc, isYouTube]);

  // Cleanup tick on unmount
  useEffect(() => {
    return () => stopTick();
  }, []);

  // Restore rate from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dr_video_rate');
    if (saved && !isNaN(Number(saved))) {
      const r = Number(saved);
      if (r >= 0.25 && r <= 4) {
        setRate(r);
        if (!isYouTube && videoRef.current) videoRef.current.playbackRate = r;
        if (isYouTube && ytPlayerRef.current) ytPlayerRef.current.setPlaybackRate(r);
      }
    }
  }, []);

  if (mode === 'invalid') {
    return (
      <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-ink-900 p-4">
        <p className="text-red-400 text-sm">{t('video.invalidUrl')}</p>
      </div>
    );
  }

  if (error && isYouTube && ytApiError) {
    return (
      <div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl bg-ink-900 p-4">
        <p className="text-red-400 mb-2">{t('video.embedBlocked')}</p>
        {ytId && (
          <a
            href={`https://www.youtube.com/watch?v=${ytId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          >
            {t('video.openOnYoutube')}
          </a>
        )}
      </div>
    );
  }

  if (error && !isYouTube) {
    return (
      <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-ink-900/50 p-4">
        <div className="text-center">
          <p className="font-semibold text-red-400">⚠️ {error}</p>
          <button onClick={retryNative} className="mt-4 btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">{t('video.retry')}</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative aspect-video rounded-2xl overflow-hidden bg-ink-900 select-none outline-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Thumbnail overlay for uploaded videos before play */}
      {!isYouTube && !hasStarted && (
        <div
          className="absolute inset-0 cursor-pointer z-20 flex items-center justify-center"
          onClick={togglePlay}
        >
          {poster ? (
            <img src={poster} alt="Video" className="w-full h-full object-cover opacity-90" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-ink-800 to-ink-900 opacity-90" />
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-fire-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
              <svg className="h-10 w-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </div>
      )}

      {/* YouTube thumbnail before API loads */}
      {isYouTube && !hasStarted && !ytApiError && (
        <div
          className="absolute inset-0 cursor-pointer z-20 bg-black"
          onClick={togglePlay}
        >
          <img src={getYouTubeThumbnail(effectiveSrc) ?? ''} alt="Play" className="w-full h-full object-cover opacity-90" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-fire-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
              <svg className="h-10 w-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </div>
      )}

      {/* YouTube container (IFrame API renders here) */}
      {isYouTube && <div ref={ytContainerRef} className="absolute inset-0 w-full h-full" />}

      {/* Native video element */}
      {!isYouTube && (
        <video
          ref={videoRef}
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {/* Loading spinner */}
      {isLoading && !hasStarted && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-900/60 pointer-events-none">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-fire-500/30 border-t-fire-500" />
        </div>
      )}

      {/* Controls */}
      {showControls && isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 z-30">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 mb-2 accent-fire-500 cursor-pointer"
          />
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="p-2 text-white hover:text-fire-400 transition-colors" title={isPlaying ? t('video.pause') : t('video.play')}>
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <span className="text-xs text-gray-300 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <div className="flex-1" />
            <button onClick={toggleMute} className="p-2 text-white hover:text-fire-400 transition-colors" title={t('video.mute') || 'Mute'}>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                {isMuted ? (
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                ) : (
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                )}
              </svg>
            </button>
            <button onClick={cycleRate} className="px-2 py-1 text-xs font-bold text-white bg-white/10 rounded hover:bg-white/20 transition-colors" title={t('video.speed')}>
              {rate}x
            </button>
            {isYouTube ? (
              <button className="px-2 py-1 text-xs font-bold text-white bg-white/10 rounded cursor-not-allowed opacity-50" title="جودة يوتيوب غير مضبوطة برمجياً">
                {QUALITY_LABELS[quality]}
              </button>
            ) : (
              <button onClick={cycleQuality} className="px-2 py-1 text-xs font-bold text-white bg-white/10 rounded hover:bg-white/20 transition-colors" title={t('video.quality')}>
                {QUALITY_LABELS[quality]}
              </button>
            )}
            <button onClick={togglePiP} className="p-2 text-white hover:text-fire-400 transition-colors" title={t('video.pip')}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4zM4 12l4-4 4 4M16 8l-4 4-4-4" /></svg>
            </button>
            <button onClick={toggleFullscreen} className="p-2 text-white hover:text-fire-400 transition-colors" title={t('video.fullscreen')}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* YouTube fallback link */}
      {isYouTube && ytApiError && ytId && (
        <a
          href={`https://www.youtube.com/watch?v=${ytId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-3 left-3 z-40 btn-fire rounded-lg px-3 py-1.5 text-xs font-bold text-white"
        >
          {t('video.openLink')}
        </a>
      )}
    </div>
  );
}
