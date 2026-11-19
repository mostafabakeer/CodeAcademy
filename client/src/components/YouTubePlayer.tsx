import { useEffect, useRef, useState } from 'react';
import { getYouTubeThumbnail } from '../lib/youtube';
import { unlockAudio } from '../lib/sound';
import { useLang } from '../i18n';

interface YouTubePlayerProps {
  videoId: string;
  initialTime?: number;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onDuration?: (duration: number) => void;
  onTimeUpdate?: (seconds: number) => void;
  onProgress?: (seconds: number) => void;
  playbackRate?: number;
  muted?: boolean;
  autoPlay?: boolean;
}

/**
 * تحميل YouTube IFrame API مرة واحدة لكل صفحة.
 * نستخدمه بدل iframe عادي لأن الـ iframe وحده لا يعطي أي حدث تقدّم،
 * فكانت دروس يوتيوب تُسجّل 0% مشاهدة مهما شاهد الطالب.
 */
let apiPromise: Promise<any> | null = null;

function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } catch {
        /* ignore */
      }
      if (w.YT?.Player) resolve(w.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube API failed'));
    };
    document.head.appendChild(script);

    window.setTimeout(() => {
      if (w.YT?.Player) resolve(w.YT);
      else {
        apiPromise = null;
        reject(new Error('YouTube API timeout'));
      }
    }, 12_000);
  });

  return apiPromise;
}

export default function YouTubePlayer({
  videoId,
  initialTime = 0,
  autoPlay = false,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onError,
  onDuration,
  onTimeUpdate,
  onProgress,
}: YouTubePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [loading, setLoading] = useState(autoPlay);
  const [apiFailed, setApiFailed] = useState(false);
  const { t } = useLang();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;
  const cbRef = useRef({ onReady, onPlay, onPause, onEnded, onError, onDuration, onTimeUpdate, onProgress });
  cbRef.current = { onReady, onPlay, onPause, onEnded, onError, onDuration, onTimeUpdate, onProgress };

  useEffect(() => {
    if (!isPlaying) return;

    let cancelled = false;
    let timer: number | undefined;
    let safetyTimer: number | undefined;
    let lastProgressAt = 0;
    let lastProgressSec = -1;

    const stopSafety = () => {
      if (safetyTimer !== undefined) {
        window.clearTimeout(safetyTimer);
        safetyTimer = undefined;
      }
    };
    // المؤشر لا يختفي إلا عند PLAYING فعلياً؛ مؤقت أمان فقط لو منع المتصفح التشغيل.
    const finishLoading = () => {
      stopSafety();
      if (!cancelled) setLoading(false);
    };

    const emitProgress = (force = false) => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      const seconds = Number(p.getCurrentTime()) || 0;
      cbRef.current.onTimeUpdate?.(seconds);
      const whole = Math.floor(seconds);
      if (whole <= 0) return;
      const now = Date.now();
      if (!force && now - lastProgressAt < 5000 && whole - lastProgressSec < 5) return;
      lastProgressAt = now;
      lastProgressSec = whole;
      cbRef.current.onProgress?.(whole);
    };

    const stopTimer = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        playerRef.current = new YT.Player(hostRef.current, {
          videoId,
          playerVars: {
            autoplay: 1,
            start: Math.floor(initialTimeRef.current),
            rel: 0,
            modestbranding: 1,
            cc_load_policy: 1,
            iv_load_policy: 3,
            playsinline: 1,
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              cbRef.current.onReady?.();
              const duration = Number(e.target.getDuration?.() ?? 0);
              if (duration > 0) cbRef.current.onDuration?.(duration);
              if (initialTimeRef.current > 0) e.target.seekTo(initialTimeRef.current, true);
              stopSafety();
              safetyTimer = window.setTimeout(() => { if (!cancelled) setLoading(false); }, 12_000);
            },
            onStateChange: (e: any) => {
              if (cancelled) return;
              const state = YT.PlayerState;
              if (e.data === state.PLAYING) {
                finishLoading();
                cbRef.current.onPlay?.();
                stopTimer();
                timer = window.setInterval(() => emitProgress(), 1000);
              } else if (e.data === state.PAUSED) {
                finishLoading();
                stopTimer();
                cbRef.current.onPause?.();
                emitProgress(true);
              } else if (e.data === state.ENDED) {
                finishLoading();
                stopTimer();
                emitProgress(true);
                cbRef.current.onEnded?.();
              } else if (e.data === state.BUFFERING || e.data === state.UNSTARTED || e.data === state.CUED) {
                // تقطيع/انتظار داخل المشغّل ⇒ نرجع المؤشر بدل شاشة سوداء.
                if (!cancelled) setLoading(true);
              }
            },
            onError: () => {
              finishLoading();
              if (!cancelled) cbRef.current.onError?.('video error');
            },
          },
        });
      })
      .catch(() => {
        // فشل تحميل الـ API (شبكة بطيئة/حجب) ⇒ نرجع لـ iframe عادي:
        // الفيديو يعمل، فقط بلا تتبّع تقدّم، بدل شاشة معطّلة.
        if (!cancelled) {
          setApiFailed(true);
          stopSafety();
          safetyTimer = window.setTimeout(() => { if (!cancelled) setLoading(false); }, 12_000);
        }
      });

    return () => {
      cancelled = true;
      stopTimer();
      stopSafety();
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [isPlaying, videoId]);

  const thumbnailUrl = getYouTubeThumbnail(`https://youtu.be/${videoId}`);

  const params = new URLSearchParams({
    autoplay: '1',
    start: String(Math.floor(initialTime)),
    rel: '0',
    modestbranding: '1',
    cc_load_policy: '1',
    iv_load_policy: '3',
    playsinline: '1',
  });
  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;

  const activate = () => {
    // نفتح سياق الصوت داخل تفاعل المستخدم حتى تُسمح نغمة الاحتفال لاحقاً.
    unlockAudio();
    setLoading(true);
    setIsPlaying(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink-900 shadow-2xl">
      {!isPlaying ? (
        <button
          onClick={activate}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/40 transition-all hover:bg-black/25"
          aria-label="تشغيل الفيديو"
        >
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt="Video thumbnail"
              className="absolute inset-0 h-full w-full object-cover opacity-85"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-fire-500 shadow-lg transition-transform hover:scale-110">
              <svg className="ml-1 h-10 w-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </button>
      ) : apiFailed ? (
        <iframe
          src={embedUrl}
          className="absolute inset-0 h-full w-full border-0"
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          onLoad={() => setLoading(false)}
        />
      ) : (
        <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      )}
      {isPlaying && loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink-900/70 pointer-events-none">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-fire-500/30 border-t-fire-500" />
          <p className="text-xs font-bold text-gray-200">{t('video.loading')}</p>
        </div>
      )}
    </div>
  );
}
