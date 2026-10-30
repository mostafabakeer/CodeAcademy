import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useLang } from '../i18n';
import { extractYouTubeId, buildYouTubeWatchUrlFrom, isYouTubeUrl } from '../lib/youtube';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface VideoPlayerProps {
  // Interface 1: Direct video source
  src?: string;
  poster?: string;
  autoPlay?: boolean;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  resumeAt?: number;

  // Interface 2: LessonPlayer style (videoType + videoUrl)
  videoType?: 'youtube' | 'upload';
  videoUrl?: string;
  initialTime?: number;
  onProgress?: (seconds: number) => void;
  onDuration?: (duration: number) => void;
}

/** معرّفات حالة مشغّل يوتيوب (YT.PlayerState). */
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

const YT_IFRAME_HOST = 'https://www.youtube.com';
const YT_API_SRC = 'https://www.youtube.com/iframe_api';

/**
 * مهلات قصيرة: المشغّل الآن لا يُحمَّل إلا بعد ضغط المستخدم،
 * فانتظار 25 ثانية كان يعني شاشة تحميل طويلة بلا داعٍ.
 */
const API_TIMEOUT_MS = 8_000;
const READY_TIMEOUT_MS = 8_000;

/** قراءة موضع التشغيل كل نصف ثانية (العرض يتحدّث عند تغيّر الثانية فقط). */
const TICK_MS = 500;
/** إبلاغ الصفحة بالتقدّم كل ١٠ ثوانٍ + إجباريًا عند الإيقاف/الخروج. */
const EMIT_MS = 10_000;

const RATES = [0.75, 1, 1.25, 1.5, 2];

/**
 * يحمّل YouTube IFrame Player API مرة واحدة فقط ويشارك الوعد بين كل المشغّلات.
 * يرفض سريعًا عند الحجب/الانقطاع، وعندها نرجع لـ iframe عادي بدل شاشة خطأ ميتة.
 */
let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (timer) clearTimeout(timer);
      prev?.();
      resolve();
    };

    const script = document.getElementById('yt-iframe-api') as HTMLScriptElement | null;
    if (!script) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = YT_API_SRC;
      tag.async = true;
      tag.onerror = () => {
        if (timer) clearTimeout(timer);
        apiPromise = null;
        reject(new Error('iframe_api load failed'));
      };
      document.head.appendChild(tag);
    }

    timer = setTimeout(() => {
      // نسمح بإعادة المحاولة في المرة القادمة
      apiPromise = null;
      reject(new Error('iframe_api timeout'));
    }, API_TIMEOUT_MS);
  });

  return apiPromise;
}

/**
 * يقرّر طريقة التشغيل:
 *  - `youtube` مشغّل مدمج
 *  - `upload` عنصر <video> أصلي (ملف مرفوع)
 *  - `invalid` النوع يوتيوب لكن الرابط غير قابل للاستخراج
 *
 * لو النوع مفقود تمامًا نستنتجه من شكل الرابط (أكثر أمانًا للبيانات القديمة).
 */
function resolveMode(
  videoType: string | undefined,
  videoUrl: string,
): 'youtube' | 'upload' | 'invalid' {
  const id = extractYouTubeId(videoUrl);
  if (videoType === 'upload') return 'upload';
  if (videoType === 'youtube') return id ? 'youtube' : 'invalid';
  return isYouTubeUrl(videoUrl) ? 'youtube' : 'upload';
}

/** صورة معاينة يوتيوب (نفس مصغّرات الموقع — بلا أي سكربت خارجي). */
function youTubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** يكتشف أجهزة اللمس: عليها نستخدم أدوات يوتيوب/المتصفح الأصلية (أثبت وأسرع). */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    if (!mq) return;
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return coarse;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
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
  const { t } = useLang();
  const coarse = useCoarsePointer();
  const coarseRef = useRef(coarse);
  coarseRef.current = coarse;

  const effectiveSrc = src || videoUrl || '';
  const mode = resolveMode(videoType, videoUrl ?? src ?? '');
  const isYouTube = mode === 'youtube';
  const ytId = extractYouTubeId(videoUrl ?? src ?? '');

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hostWrapRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const maxWatchedRef = useRef(0);
  const lastEmitRef = useRef(0);
  const lastDisplayRef = useRef(-1);
  const liveTimeRef = useRef(0);
  const ytReadyRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const aliveRef = useRef(true);
  const autoPlayRef = useRef(autoPlay);
  const resumeRef = useRef(resumeAt || initialTime || 0);

  const [started, setStarted] = useState(() => !isYouTube || autoPlay);
  const [loading, setLoading] = useState(isYouTube ? true : true);
  const [error, setError] = useState<string | null>(null);
  const [errorLink, setErrorLink] = useState<string | null>(null);
  const [iframeFallback, setIframeFallback] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showControls, setShowControls] = useState(true);

  // الاستدعاءات في ref حتى لا يُعاد بناء مشغّل يوتيوب عند كل رندر للصفحة.
  const cbRef = useRef({ onProgress, onDuration, onDurationChange, onTimeUpdate, onEnded, onError });
  cbRef.current = { onProgress, onDuration, onDurationChange, onTimeUpdate, onEnded, onError };
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const stopTicking = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  /** تحديث واجهة الوقت عند تغيّر الثانية المعروضة فقط (بدل كل نبضة). */
  const setDisplayTime = useCallback((seconds: number) => {
    liveTimeRef.current = seconds;
    const whole = Math.floor(seconds);
    if (whole === lastDisplayRef.current) return;
    lastDisplayRef.current = whole;
    setCurrentTime(seconds);
  }, []);

  /**
   * يبلّغ عن التقدّم مع خنق الكتابة: maxWatched يمنع التراجع عند الرجوع للخلف،
   * والخنق يمنع الكتابة على التخزين كل ثانية (تقرير كل ١٠ ثوانٍ + إجباري عند
   * الإيقاف/الانتهاء/إزالة المكوّن).
   */
  const report = useCallback(
    (seconds: number, force = false) => {
      if (seconds > 0) {
        maxWatchedRef.current = Math.max(maxWatchedRef.current, seconds);
        setDisplayTime(seconds);
      }
      if (seconds <= 0) return;
      const now = Date.now();
      if (!force && now - lastEmitRef.current < EMIT_MS) return;
      lastEmitRef.current = now;
      cbRef.current.onProgress?.(Math.floor(maxWatchedRef.current));
    },
    [setDisplayTime],
  );

  // عند تغيير الدرس/الرابط: نعيد ضبط كل شيء ونرجع لواجهة المعاينة.
  useEffect(() => {
    maxWatchedRef.current = 0;
    lastEmitRef.current = 0;
    lastDisplayRef.current = -1;
    liveTimeRef.current = 0;
    pendingPlayRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setLoading(true);
    setIsPlaying(false);
    setError(null);
    setErrorLink(null);
    setIframeFallback(false);
    setStarted(!isYouTube || autoPlay);
  }, [videoUrl, src, isYouTube, autoPlay]);

  // موضع الاستئناف قد يصل بعد التركيب (بيانات الدرس غير متزامنة).
  useEffect(() => {
    resumeRef.current = resumeAt || initialTime || 0;
  }, [resumeAt, initialTime]);

  // إبلاغ أخير عند إخفاء الصفحة/إغلاقها حتى لا يضيع تقدّم آخر دقائق.
  useEffect(() => {
    const flush = () => {
      const seconds = isYouTube
        ? ytPlayerRef.current?.getCurrentTime?.() || 0
        : videoRef.current?.currentTime || 0;
      const best = Math.max(seconds, maxWatchedRef.current);
      if (best > 0) cbRef.current.onProgress?.(Math.floor(best));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [isYouTube]);

  /* ================= مشغّل يوتيوب المدمج (يُحمَّل بعد الضغط فقط) ================= */
  useEffect(() => {
    if (!isYouTube || !started) return;
    const id = ytId;
    if (!id) return;
    const wrap = hostWrapRef.current;
    if (!wrap) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorLink(null);
    setIframeFallback(false);

    // YT.Player يستبدل عنصر الحاوية بـ iframe؛ ننشئه يدويًا داخل غلاف ثابت
    // حتى يبقى الغلاف موجودًا بعد إعادة الإنشاء (تغيير الدرس).
    wrap.innerHTML = '';
    const host = document.createElement('div');
    host.className = 'h-full w-full';
    wrap.appendChild(host);

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !aliveRef.current) return;

        const fail = (message: string) => {
          if (cancelled) return;
          stopTicking();
          setLoading(false);
          setIsPlaying(false);
          setError(message);
          setErrorLink(buildYouTubeWatchUrlFrom(id));
        };

        const player = new window.YT!.Player(host, {
          videoId: id,
          playerVars: {
            autoplay: autoPlayRef.current || pendingPlayRef.current ? 1 : 0,
            playsinline: 1,
            enablejsapi: 1,
            rel: 0,
            modestbranding: 1,
            // على اللمس: أدوات يوتيوب الأصلية. على الديسكتوب: أدواتنا المخصّصة.
            controls: coarseRef.current ? 1 : 0,
            disablekb: coarseRef.current ? 0 : 1,
            fs: coarseRef.current ? 1 : 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              ytReadyRef.current = true;
              if (watchdogRef.current) {
                clearTimeout(watchdogRef.current);
                watchdogRef.current = undefined;
              }
              setLoading(false);
              const d = e.target.getDuration?.() || 0;
              setDuration(d);
              cbRef.current.onDuration?.(d);
              cbRef.current.onDurationChange?.(d);

              const resume = resumeRef.current;
              if (resume > 0 && d > 0 && resume < d - 2) e.target.seekTo(resume, true);

              if (pendingPlayRef.current || autoPlayRef.current) {
                pendingPlayRef.current = false;
                try {
                  e.target.playVideo();
                } catch {
                  /* autoplay prevented */
                }
              }
            },
            onStateChange: (e: any) => {
              if (cancelled) return;
              const s = e.data;
              if (s === YT_STATE.PLAYING) {
                setIsPlaying(true);
                setLoading(false);
                report(e.target.getCurrentTime?.() || 0, true);
              } else if (s === YT_STATE.PAUSED) {
                setIsPlaying(false);
                report(e.target.getCurrentTime?.() || 0, true);
              } else if (s === YT_STATE.ENDED) {
                setIsPlaying(false);
                stopTicking();
                report(e.target.getCurrentTime?.() || 0, true);
                cbRef.current.onEnded?.();
              } else if (s === YT_STATE.BUFFERING) {
                setLoading(true);
              } else if (s === YT_STATE.CUED) {
                setLoading(false);
              }
            },
            onError: (e: any) => {
              const code = e?.data;
              if (code === 101 || code === 150) fail(tRef.current('video.embedBlocked'));
              else if (code === 100) fail(tRef.current('video.notFound'));
              else fail(tRef.current('video.error'));
            },
          },
        });

        ytPlayerRef.current = player;

        // حارس: لو onReady لم يشتعل (منع تضمين/تعارض) نعرض زر الفتح بدل التعليق.
        watchdogRef.current = setTimeout(() => {
          if (cancelled || ytReadyRef.current) return;
          fail(tRef.current('video.error'));
        }, READY_TIMEOUT_MS);

        stopTicking();
        tickRef.current = setInterval(() => {
          if (cancelled) return;
          report(player.getCurrentTime?.() || 0);
        }, TICK_MS);
      })
      .catch(() => {
        if (cancelled || !aliveRef.current) return;
        setLoading(false);
        // الـ API لم يُحمّل (حجب/انقطاع): iframe عادي يعمل من غيره، أفضل من شاشة ميتة.
        setIframeFallback(true);
      });

    return () => {
      cancelled = true;
      stopTicking();
      ytReadyRef.current = false;
      pendingPlayRef.current = false;
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = undefined;
      }
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {
        /* already destroyed */
      }
      ytPlayerRef.current = null;
      wrap.innerHTML = '';
    };
  }, [isYouTube, started, ytId, report, stopTicking]);

  // المشغّل المدمج لا يتكيّف مع تغيّر حجم الحاوية تلقائيًا (مهم على الموبايل).
  useEffect(() => {
    if (!isYouTube || !started) return;
    const host = hostWrapRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w && h) {
        try {
          ytPlayerRef.current?.setSize?.(w, h);
        } catch {
          /* not ready */
        }
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [isYouTube, started]);

  /* ================= مشغّل الملفات المرفوعة ================= */
  useEffect(() => {
    if (isYouTube) return;
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      cbRef.current.onDurationChange?.(video.duration);
      cbRef.current.onDuration?.(video.duration);
      const resume = resumeRef.current;
      if (resume > 0 && resume < video.duration - 1) video.currentTime = resume;
    };

    const handleTimeUpdate = () => {
      cbRef.current.onTimeUpdate?.(video.currentTime);
      report(video.currentTime);
    };

    const handleCanPlay = () => setLoading(false);
    const handleWaiting = () => setLoading(true);
    const handlePlaying = () => {
      setIsPlaying(true);
      setLoading(false);
    };
    const handlePause = () => {
      setIsPlaying(false);
      report(video.currentTime, true);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      report(video.currentTime, true);
      cbRef.current.onEnded?.();
    };
    const handleError = () => {
      const err = new Error(tRef.current('video.error'));
      setError(err.message);
      setLoading(false);
      cbRef.current.onError?.(err);
    };
    const handleVolume = () => setMuted(video.muted);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    video.addEventListener('volumechange', handleVolume);

    if (autoPlayRef.current) {
      video.play().catch(() => {
        /* autoplay prevented */
      });
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.removeEventListener('volumechange', handleVolume);
      report(video.currentTime, true);
    };
  }, [isYouTube, report, effectiveSrc]);

  /* ================= أدوات التشغيل ================= */
  const startPlayback = () => {
    pendingPlayRef.current = true;
    setStarted(true);
    setLoading(true);
  };

  const play = () => {
    if (isYouTube) {
      if (!ytReadyRef.current) {
        pendingPlayRef.current = true;
        return;
      }
      try {
        ytPlayerRef.current?.playVideo?.();
      } catch {
        /* not ready */
      }
      return;
    }
    videoRef.current?.play().catch(() => {
      /* autoplay prevented */
    });
  };

  const pause = () => {
    if (isYouTube) {
      try {
        ytPlayerRef.current?.pauseVideo?.();
      } catch {
        /* not ready */
      }
      return;
    }
    videoRef.current?.pause();
  };

  const togglePlay = () => (isPlaying ? pause() : play());

  const seek = (seconds: number) => {
    const max = duration || 0;
    const target = Math.max(0, max ? Math.min(seconds, max) : seconds);
    setDisplayTime(target);
    if (isYouTube) {
      try {
        ytPlayerRef.current?.seekTo?.(target, true);
      } catch {
        /* not ready */
      }
      return;
    }
    const v = videoRef.current;
    if (v) v.currentTime = target;
  };

  const seekBy = (delta: number) => seek(liveTimeRef.current + delta);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (isYouTube) {
      try {
        if (next) ytPlayerRef.current?.mute?.();
        else ytPlayerRef.current?.unMute?.();
      } catch {
        /* not ready */
      }
      return;
    }
    if (videoRef.current) videoRef.current.muted = next;
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (isYouTube) {
      try {
        ytPlayerRef.current?.setPlaybackRate?.(next);
      } catch {
        /* not ready */
      }
      return;
    }
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    (el.requestFullscreen?.() ?? Promise.reject(new Error('no fullscreen'))).catch(() => {});
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekBy(10);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seekBy(-10);
        break;
      case 'm':
        toggleMute();
        break;
      case 'f':
        fullscreen();
        break;
      default:
        break;
    }
  };

  const showCustomControls = !coarse && !iframeFallback;
  const controlsVisible = showControls || !isPlaying;
  const revealControls = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!isPlaying) return;
      setShowControls(false);
    }, 3000);
  };

  if (mode === 'invalid') {
    return <PlayerError message={t('video.invalidUrl')} link={videoUrl || null} linkLabel={t('video.openLink')} />;
  }

  if (error) {
    return <PlayerError message={error} link={errorLink} linkLabel={t('video.openOnYoutube')} />;
  }

  const posterSrc = poster || (ytId ? youTubeThumb(ytId) : '');

  return (
    <div
      ref={containerRef}
      tabIndex={showCustomControls ? 0 : -1}
      onKeyDown={showCustomControls ? onKeyDown : undefined}
      onMouseEnter={revealControls}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (!isPlaying) return;
        setShowControls(false);
      }}
      className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-ink-900 outline-none ring-fire-500/60 focus-visible:ring-2"
    >
      {isYouTube ? (
        !started ? (
          <button
            type="button"
            onClick={startPlayback}
            className="absolute inset-0 flex flex-col items-center justify-center bg-ink-900"
            aria-label={t('video.play')}
          >
            {posterSrc && (
              <img
                src={posterSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/25 to-ink-950/40" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-fire-600 text-white shadow-[0_10px_30px_-8px_rgba(244,63,79,0.75)] transition-transform duration-200 group-hover:scale-105">
              <svg className="ms-0.5 h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="relative mt-3 rounded-full bg-ink-950/70 px-4 py-1.5 text-sm font-bold text-white">
              {t('video.play')}
            </span>
          </button>
        ) : iframeFallback ? (
          <>
            <iframe
              src={`${YT_IFRAME_HOST}/embed/${ytId}?playsinline=1&rel=0&modestbranding=1`}
              title={t('video.play')}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
            <p className="pointer-events-none absolute bottom-2 start-2 z-10 rounded-md bg-ink-950/80 px-2 py-1 text-[11px] text-gray-300">
              ⚠️ {t('video.progressUnavailable')}
            </p>
          </>
        ) : (
          <div ref={hostWrapRef} className="absolute inset-0 h-full w-full" />
        )
      ) : (
        <video
          ref={videoRef}
          src={effectiveSrc}
          poster={poster}
          playsInline
          controls={coarse}
          className="absolute inset-0 h-full w-full object-contain"
          preload="metadata"
        />
      )}

      {loading && (!isYouTube || started) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-ink-900/80">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-fire-500/25 border-t-fire-500" />
            <div className="absolute inset-0 m-auto h-6 w-6 animate-flame rounded-full bg-gradient-to-br from-fire-500 to-ember-500" />
          </div>
        </div>
      )}

      {showCustomControls && (started || !isYouTube) && (
        <div
          className={`pointer-events-none absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-ink-950/95 via-ink-950/20 to-transparent p-3 transition-opacity duration-200 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 text-white">
            <button
              onClick={togglePlay}
              className="btn-ghost-fire flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              aria-label={isPlaying ? t('video.pause') : t('video.play')}
            >
              {isPlaying ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => seekBy(-10)}
              className="btn-ghost-fire flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              aria-label={t('video.rewind')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M20 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={() => seekBy(10)}
              className="btn-ghost-fire flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              aria-label={t('video.forward')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 5l7 7-7 7" />
              </svg>
            </button>

            <span className="shrink-0 font-mono text-xs tabular-nums text-gray-200">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1.5 min-w-24 flex-1 cursor-pointer accent-fire-500"
              aria-label={t('video.seek')}
            />

            <button
              onClick={toggleMute}
              className="btn-ghost-fire flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              aria-label={muted ? t('video.unmute') : t('video.mute')}
            >
              {muted ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6m0-6l6 6" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
                </svg>
              )}
            </button>

            <button
              onClick={cycleRate}
              className="btn-ghost-fire shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold tabular-nums"
              aria-label={t('video.speed')}
            >
              {rate}x
            </button>

            <button
              onClick={fullscreen}
              className="btn-ghost-fire flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              aria-label={t('video.fullscreen')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** شاشة الخطأ مع زر fallback (فتح على يوتيوب / فتح الرابط الأصلي). */
function PlayerError({ message, link, linkLabel }: { message: string; link: string | null; linkLabel: string }) {
  return (
    <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-ink-900/50 p-4">
      <div className="max-w-md text-center">
        <p className="font-semibold text-fire-400">⚠️ {message}</p>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-fire mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white"
          >
            🔗 {linkLabel}
          </a>
        )}
      </div>
    </div>
  );
}
