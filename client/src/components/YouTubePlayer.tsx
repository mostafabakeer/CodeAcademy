import { useEffect, useRef, useState, useCallback } from 'react';
import { useLang } from '../i18n';
import { extractYouTubeId, getYouTubeThumbnail } from '../lib/youtube';

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

export default function YouTubePlayer({
  videoId,
  initialTime = 0,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onError,
  onDuration,
  onTimeUpdate,
  onProgress,
  playbackRate = 1,
  muted = false,
  autoPlay = false,
}: YouTubePlayerProps) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<{ time: number; rate: number; mute: boolean; action?: 'play' } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [apiError, setApiError] = useState(false);

  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const p = playerRef.current;
      if (p?.getPlayerState?.() === 1) {
        const ct = p.getCurrentTime();
        setCurrentTime(ct);
        onTimeUpdate?.(ct);
        onProgress?.(Math.floor(ct));
      }
    }, 1000);
  }, [onTimeUpdate, onProgress]);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }
    readyRef.current = false;
    if (containerRef.current) {
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
    }
  }, []);

  const loadApi = useCallback((cb: () => void, onFail: () => void) => {
    if ((window as any).YT?.Player) { cb(); return; }
    if (document.querySelector('script[data-yt-iframe-api]')) {
      const wait = () => { if ((window as any).YT?.Player) cb(); else setTimeout(wait, 150); };
      wait(); return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.ytIframeApi = '1';
    const deadline = Date.now() + 12_000;
    const poll = () => {
      if ((window as any).YT?.ready) { cb(); return; }
      if (Date.now() > deadline) { onFail(); return; }
      setTimeout(poll, 150);
    };
    script.onload = () => setTimeout(poll, 300);
    script.onerror = onFail;
    document.head.appendChild(script);
    setTimeout(poll, 300);
  }, []);

  const initPlayer = useCallback(() => {
    if (!videoId || !containerRef.current) return;
    if (!document.body.contains(containerRef.current)) return;

    destroyPlayer();

    const queued = queueRef.current;
    queueRef.current = null;

    const player = new (window as any).YT.Player(containerRef.current, {
      videoId,
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin,
        cc_load_policy: 1,
        iv_load_policy: 1,
      },
      events: {
        onReady: () => {
          readyRef.current = true;
          const p = player;
          if (queued) {
            if (queued.time > 0) p.seekTo(queued.time, true);
            p.setPlaybackRate(queued.rate);
            p.setVolume(queued.mute ? 0 : 100);
            if (queued.action === 'play') p.playVideo();
          }
          setIsLoading(false);
          setHasStarted(true);
          onReady?.();
          const d = p.getDuration();
          if (d > 0) onDuration?.(d);
        },
        onStateChange: (ev: { data: number }) => {
          const s = ev.data;
          const YT = (window as any).YT;
          if (s === YT?.PlayerState?.PLAYING) {
            setIsPlaying(true);
            setIsLoading(false);
            startTick();
            setHasStarted(true);
            onPlay?.();
            const d = playerRef.current?.getDuration?.();
            if (d > 0 && duration === 0) onDuration?.(d);
          } else if (s === YT?.PlayerState?.PAUSED || s === YT?.PlayerState?.ENDED) {
            setIsPlaying(false);
            stopTick();
            onPause?.();
            if (s === YT?.PlayerState?.ENDED) onEnded?.();
          } else if (s === YT?.PlayerState?.BUFFERING) {
            setIsLoading(true);
          }
        },
        onError: (ev: { data: number }) => {
          console.error('YouTube player error:', ev.data);
          setApiError(true);
          setIsLoading(false);
          onError?.(t('video.embedBlocked'));
        },
      },
    });
    playerRef.current = player;

    if (initialTime > 0) {
      if (readyRef.current) player.seekTo(initialTime, true);
      else queueRef.current = { time: initialTime, rate: playbackRate, mute: muted };
    }
  }, [videoId, initialTime, playbackRate, muted, onReady, onDuration, onPlay, onPause, onEnded, onError, startTick, stopTick, duration, t]);

  // Play/pause control
  const play = useCallback(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) {
      queueRef.current = { time: 0, rate: playbackRate, mute: muted, action: 'play' };
      setHasStarted(true);
      setIsLoading(true);
      return;
    }
    p.playVideo();
  }, [playbackRate, muted]);

  const pause = useCallback(() => {
    const p = playerRef.current;
    if (p) p.pauseVideo();
  }, []);

  // Initialize
  useEffect(() => {
    let mounted = true;
    let initTimer: ReturnType<typeof setTimeout> | null = null;

    const tryInit = () => {
      if (!mounted) return;
      if (containerRef.current && document.body.contains(containerRef.current)) {
        initPlayer();
      } else {
        initTimer = setTimeout(tryInit, 50);
      }
    };

    loadApi(
      () => {
        if (!mounted) return;
        if ((window as any).YT?.Player) initTimer = setTimeout(tryInit, 0);
        else tryInit();
      },
      () => { if (mounted) { setApiError(true); setIsLoading(false); onError?.(t('video.embedBlocked')); } }
    );

    return () => {
      mounted = false;
      if (initTimer) clearTimeout(initTimer);
      destroyPlayer();
      stopTick();
    };
  }, [videoId, loadApi, initPlayer, destroyPlayer, stopTick, t, onError]);

  // Apply rate/muted changes
  useEffect(() => {
    const p = playerRef.current;
    if (p && readyRef.current) {
      p.setPlaybackRate(playbackRate);
      p.setVolume(muted ? 0 : 100);
    }
  }, [playbackRate, muted]);

  // Seek to time
  const seek = useCallback((seconds: number) => {
    const p = playerRef.current;
    if (p) p.seekTo(Math.max(0, Math.min(seconds, duration || 0)), true);
    setCurrentTime(seconds);
  }, [duration]);

  if (apiError) {
    return (
      <div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl bg-ink-900 p-4">
        <p className="text-red-400 mb-2">{t('video.embedBlocked')}</p>
        <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">
          {t('video.openOnYoutube')}
        </a>
      </div>
    );
  }

  return (
    <div className="relative aspect-video rounded-2xl overflow-hidden bg-ink-900">
      {!hasStarted && !apiError && (
        <div className="absolute inset-0 cursor-pointer z-20 bg-black" onClick={play}>
          <img src={getYouTubeThumbnail(`https://youtu.be/${videoId}`) ?? ''} alt="Play" className="w-full h-full object-cover opacity-90" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-fire-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
              <svg className="h-10 w-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </div>
      )}
      {isLoading && !apiError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-900/60 pointer-events-none">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-fire-500/30 border-t-fire-500" />
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />
    </div>
  );
}