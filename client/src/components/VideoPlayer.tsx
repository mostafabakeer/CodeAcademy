import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

/** استضافة الـ iframe — النطاق القياسي المضمون العمل. */
const YT_IFRAME_HOST = 'https://www.youtube.com';
/** سكربت الـ API الرسمي؛ لازم يطابق نطاق الـ iframe وإلا onReady ما بي اشتغلش. */
const YT_API_SRC = 'https://www.youtube.com/iframe_api';

/** قراءة موضع التشغيل كل ثانية لتحديث الشريط، والإبلاغ للتقدّم كل ٤ ثوانٍ. */
const TICK_MS = 1000;
const EMIT_MS = 4000;

const RATES = [1, 1.25, 1.5, 2];

/**
 * يحمّل YouTube IFrame Player API مرة واحدة فقط ويشارك الوعد بين كل المشغّلات.
 * يرفض بعد ٢٥ ثانية، وعندها نرجع لـ iframe عادي بدل شاشة خطأ ميتة.
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

    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = YT_API_SRC;
      tag.async = true;
      // فشل تحميل السكربت (حجب/انقطاع) لازم يوصلنا كفشل سريع مش انتظار
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
    }, 25_000);
  });

  return apiPromise;
}

/**
 * يقرّر طريقة التشغيل:
 *  - `youtube` مشغّل مدمج
 *  - `upload` عنصر <video> أصلي (ملف مرفوع)
 *  - `invalid` النوع يوتيوب لكن الرابط غير قابل للاستخراج
 *
 * لو النوع مفقود entirely بنستنتجه من شكل الرابط (أكثر أمانًا للبيانات القديمة).
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxWatchedRef = useRef(0);
  const lastEmitRef = useRef(0);
  const aliveRef = useRef(true);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ytReadyRef = useRef(false);
  const ytPlayPendingRef = useRef(false);
  const readyWatchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const effectiveSrc = src || videoUrl || '';
  const mode = resolveMode(videoType, videoUrl ?? src ?? '');
  const isYouTube = mode === 'youtube';
  const ytId = extractYouTubeId(videoUrl ?? src ?? '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorLink, setErrorLink] = useState<string | null>(null);
  /** فشل تحميل الـ API → نعرض iframe عادي بدل شاشة خطأ (الفيديو يشتغل، التقدّم لا). */
  const [iframeFallback, setIframeFallback] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [showControls, setShowControls] = useState(true);

  // القيم الأولية تُقرأ مرة واحدة فقط (عند التركيب) — وإلا أُعيد بناء المشغّل مع كل رندر.
  const bootRef = useRef({ resumeAt: resumeAt || initialTime || 0, autoPlay });

  // الاستدعاءات في ref حتى لا يُعاد بناء مشغّل يوتيوب عند كل رندر للصفحة.
  const cbRef = useRef({ onProgress, onDuration, onDurationChange, onTimeUpdate, onEnded, onError });
  cbRef.current = { onProgress, onDuration, onDurationChange, onTimeUpdate, onEnded, onError };
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, []);

  const stopTicking = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  /**
   * يبلّغ عن التقدّم مع خنق الكتابة: maxWatched يمنع التراجع عند الرجوع للخلف،
   * والخنق يمنع الكتابة على localStorage كل ثانية (تقرير كل ٤ ثوانٍ + إجباري عند
   * الإيقاف/الانتهاء/إزالة المكوّن).
   */
  const report = (seconds: number, force = false) => {
    if (seconds > 0) setCurrentTime(seconds);
    if (seconds <= 0) return;
    maxWatchedRef.current = Math.max(maxWatchedRef.current, seconds);
    const now = Date.now();
    if (!force && now - lastEmitRef.current < EMIT_MS) return;
    lastEmitRef.current = now;
    cbRef.current.onProgress?.(Math.floor(maxWatchedRef.current));
  };

  /* ================= مشغّل يوتيوب المدمج ================= */
  useEffect(() => {
    if (!isYouTube) return;
    const id = extractYouTubeId(videoUrl ?? '');
    if (!id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorLink(null);
    setIframeFallback(false);

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !aliveRef.current) return;
        const host = ytHostRef.current;
        if (!host) return;

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
            autoplay: bootRef.current.autoPlay ? 1 : 0,
            playsinline: 1,
            enablejsapi: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              ytReadyRef.current = true;
              if (readyWatchdogRef.current) {
                clearTimeout(readyWatchdogRef.current);
                readyWatchdogRef.current = undefined;
              }
              setLoading(false);
              const d = e.target.getDuration?.() || 0;
              setDuration(d);
              cbRef.current.onDuration?.(d);
              cbRef.current.onDurationChange?.(d);

              const resume = bootRef.current.resumeAt;
              if (resume > 0 && d > 0 && resume < d - 2) e.target.seekTo(resume, true);

              if (ytPlayPendingRef.current) {
                // المستخدم ضغط تشغيل قبل ما المشغّل يجهز — نفّذ النية دلوقتي
                ytPlayPendingRef.current = false;
                try { e.target.playVideo(); } catch { /* autoplay prevented */ }
              }

              if (bootRef.current.autoPlay) {
                try { e.target.playVideo(); } catch { /* autoplay prevented */ }
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

        // حارس: لو onReady ما اشتعلش خلال ١٢ ثانية (فيديو محظور من embedding،
        // أو تعارض في المضيف) بنوقف السحب ونعرض زر الفتح على يوتيوب بدل التعليق
        readyWatchdogRef.current = setTimeout(() => {
          if (cancelled || ytReadyRef.current) return;
          fail(tRef.current('video.error'));
        }, 12_000);

        stopTicking();
        tickRef.current = setInterval(() => {
          if (cancelled) return;
          report(player.getCurrentTime?.() || 0);
        }, TICK_MS);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        // الـ API ما تحميلش (حجب/انقطاع): iframe عادي بيشتغل من غيره، أحسن من شاشة ميتة.
        setIframeFallback(true);
      });

    return () => {
      cancelled = true;
      stopTicking();
      ytReadyRef.current = false;
      ytPlayPendingRef.current = false;
      if (readyWatchdogRef.current) {
        clearTimeout(readyWatchdogRef.current);
        readyWatchdogRef.current = undefined;
      }
      try { ytPlayerRef.current?.destroy?.(); } catch { /* already destroyed */ }
      ytPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, videoUrl]);

  // المشغّل المدمج لا يتكيّف مع تغيّر حجم الحاوية تلقائيًا (مهم على الموبايل)
  useEffect(() => {
    if (!isYouTube) return;
    const host = ytHostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w && h) {
        try { ytPlayerRef.current?.setSize?.(w, h); } catch { /* not ready */ }
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [isYouTube]);

  /* ================= مشغّل الملفات المرفوعة ================= */
  useEffect(() => {
    if (isYouTube) return;
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      cbRef.current.onDurationChange?.(video.duration);
      cbRef.current.onDuration?.(video.duration);
      const resume = bootRef.current.resumeAt;
      if (resume > 0 && resume < video.duration) video.currentTime = resume;
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
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

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    if (bootRef.current.autoPlay) {
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
      report(video.currentTime, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube]);

  /* ================= أدوات التشغيل ================= */
  const play = () => {
    if (isYouTube) {
      if (!ytReadyRef.current) {
        // لسه مش جاهز — نحفظ النية بدل ما تضيع، و onReady هينفّذها
        ytPlayPendingRef.current = true;
        return;
      }
      try { ytPlayerRef.current?.playVideo?.(); } catch { /* not ready */ }
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      /* autoplay prevented */
    });
  };

  const pause = () => {
    if (isYouTube) {
      try { ytPlayerRef.current?.pauseVideo?.(); } catch { /* not ready */ }
      return;
    }
    videoRef.current?.pause();
  };

  const togglePlay = () => (isPlaying ? pause : play);

  const seek = (seconds: number) => {
    if (isYouTube) {
      try { ytPlayerRef.current?.seekTo?.(seconds, true); } catch { /* not ready */ }
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(seconds, v.duration));
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (isYouTube) {
      try { ytPlayerRef.current?.setPlaybackRate?.(next); } catch { /* not ready */ }
      return;
    }
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const fullscreen = () => {
    const el = isYouTube ? ytHostRef.current : videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    (el.requestFullscreen?.() ?? Promise.reject(new Error('no fullscreen'))).catch(() => {});
  };

  /* ================= واجهة ================= */
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      if (!isPlaying) return;
      if (isYouTube) {
        if (ytPlayerRef.current?.getPlayerState?.() === YT_STATE.PLAYING) setShowControls(false);
      } else if (!videoRef.current?.paused) {
        setShowControls(false);
      }
    }, 3000);
  };

  if (mode === 'invalid') {
    return <PlayerError message={t('video.invalidUrl')} link={videoUrl || null} linkLabel={t('video.openLink')} />;
  }

  if (error) {
    return <PlayerError message={error} link={errorLink} linkLabel={t('video.openOnYoutube')} />;
  }

  return (
    <div
      className="relative aspect-video rounded-2xl overflow-hidden bg-ink-900"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => {
        if (!isPlaying) return;
        if (isYouTube) {
          if (ytPlayerRef.current?.getPlayerState?.() === YT_STATE.PLAYING) setShowControls(false);
        } else if (!videoRef.current?.paused) {
          setShowControls(false);
        }
      }}
      onMouseMove={handleMouseMove}
    >
      {isYouTube ? (
        iframeFallback ? (
          <>
            <iframe
              ref={(el) => {
                if (el) ytHostRef.current = el as unknown as HTMLDivElement;
              }}
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
          <div ref={ytHostRef} className="absolute inset-0 h-full w-full" />
        )
      ) : (
        <video
          ref={videoRef}
          src={effectiveSrc}
          poster={poster}
          playsInline
          className="absolute inset-0 w-full h-full object-contain"
          preload="metadata"
        />
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-ink-900/80">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-fire-500/25 border-t-fire-500" />
            <div className="absolute inset-0 m-auto h-6 w-6 animate-flame rounded-full bg-gradient-to-br from-fire-500 to-ember-500" />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {showControls && !iframeFallback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-ink-950/90 via-transparent to-transparent p-4"
          >
            <div className="pointer-events-auto flex items-center gap-3 text-white">
              <button
                onClick={togglePlay}
                className="btn-ghost-fire rounded-lg p-2"
                aria-label={isPlaying ? t('video.pause') : t('video.play')}
              >
                {isPlaying ? (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-fire-500"
                aria-label={t('video.seek')}
              />
              <span className="w-20 text-right text-sm font-mono tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <button
                onClick={cycleRate}
                className="btn-ghost-fire rounded-lg px-2 py-1 text-xs font-bold"
                aria-label={t('video.speed')}
              >
                {rate}x
              </button>
              <button
                onClick={fullscreen}
                className="btn-ghost-fire rounded-lg p-2"
                aria-label={t('video.fullscreen')}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
